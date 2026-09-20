import type { ApiResult, ErrorCode } from "../../../shared/api-contract";

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Your account changed. Sign in again before continuing.";
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export class AccountScope {
  private controller = new AbortController();
  userId: string | null = null;

  switchTo(userId: string | null) {
    if (userId === this.userId) return;
    this.controller.abort();
    this.controller = new AbortController();
    this.userId = userId;
  }

  capture() {
    const signal = this.controller.signal;
    return {
      signal,
      assertCurrent: () => {
        if (signal.aborted) throw new DOMException("Account changed", "AbortError");
      },
    };
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  refreshSession?: () => Promise<boolean>;
  assertCurrent?: () => void;
}

export async function requestJson<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  for (let attempt = 0; attempt < 2; attempt++) {
    options.assertCurrent?.();
    let response: Response;
    try {
      response = await fetch(path, {
        method: options.method ?? "GET",
        body,
        credentials: "same-origin",
        cache: "no-store",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        signal: options.signal,
      });
    } catch (error) {
      options.assertCurrent?.();
      if (options.signal?.aborted) throw error;
      throw new ApiError(
        "service_unavailable",
        "Could not reach Souvenir. Check your connection and retry the same request.",
        503,
      );
    }
    options.assertCurrent?.();
    if (response.status === 401 && attempt === 0 && options.refreshSession) {
      const refreshed = await options.refreshSession();
      options.assertCurrent?.();
      if (refreshed) continue;
    }
    let result: ApiResult<T>;
    try {
      result = (await response.json()) as ApiResult<T>;
    } catch {
      throw new ApiError(
        "service_unavailable",
        "The server returned an unreadable response. Retry shortly.",
        response.status,
      );
    }
    options.assertCurrent?.();
    if (response.status === 401) {
      throw new ApiError(
        "unauthorized",
        "Your session has expired. Sign in again to continue.",
        401,
      );
    }
    if (result && typeof result === "object" && "error" in result) {
      throw new ApiError(
        result.error,
        result.message ?? "The request failed. Please try again.",
        response.status,
      );
    }
    if (!response.ok || !result || typeof result !== "object" || !("data" in result)) {
      throw new ApiError(
        "internal_error",
        "The server could not complete this request. Please retry.",
        response.status,
      );
    }
    return result.data;
  }
  throw new ApiError("unauthorized", "Sign in again to continue.", 401);
}
