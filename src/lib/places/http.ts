import { setTimeout as delay } from "node:timers/promises";
import { ProviderError } from "./types";

export interface ProviderHttp {
  json(url: string, init?: RequestInit): Promise<unknown>;
}
export function createProviderHttp(
  userAgent: string,
  options: {
    fetch?: typeof fetch;
    intervalMs?: number;
    timeoutMs?: number;
    maxBytes?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): ProviderHttp {
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? delay;
  const interval = Math.max(1000, options.intervalMs ?? 1000);
  const timeout = options.timeoutMs ?? 8000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  let nextRequest = 0;
  let busy = false;
  return {
    async json(url, init = {}) {
      if (busy) throw new ProviderError("rate_limited", interval);
      if (nextRequest - now() > timeout)
        throw new ProviderError("rate_limited", nextRequest - now());
      busy = true;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          await sleep(Math.max(0, nextRequest - now()));
          nextRequest = now() + interval;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeout);
          try {
            const response = await send(url, {
              ...init,
              redirect: "error",
              signal: controller.signal,
              headers: { ...init.headers, "User-Agent": userAgent, Accept: "application/json" },
            });
            if ([429, 502, 503, 504].includes(response.status)) {
              const rawRetry = response.headers.get("retry-after");
              const seconds = rawRetry === null ? NaN : Number(rawRetry);
              const retryMs =
                rawRetry === null
                  ? 1000
                  : Number.isFinite(seconds)
                    ? Math.max(0, seconds * 1000)
                    : Math.max(1000, Date.parse(rawRetry) - now() || 1000);
              nextRequest = Math.max(nextRequest, now() + retryMs);
              await response.body?.cancel();
              if (attempt === 0 && retryMs <= timeout) continue;
              throw new ProviderError("rate_limited", retryMs);
            }
            if (!response.ok) {
              await response.body?.cancel();
              throw new ProviderError("unavailable");
            }
            if (Number(response.headers.get("content-length")) > maxBytes) {
              await response.body?.cancel();
              throw new ProviderError("too_large");
            }
            const reader = response.body?.getReader();
            if (!reader) throw new ProviderError("invalid_response");
            const decoder = new TextDecoder();
            let text = "",
              bytes = 0;
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              bytes += value.byteLength;
              if (bytes > maxBytes) {
                await reader.cancel();
                throw new ProviderError("too_large");
              }
              text += decoder.decode(value, { stream: true });
            }
            const data: unknown = JSON.parse(text + decoder.decode());
            if (data && typeof data === "object" && "error" in data) {
              nextRequest = Math.max(nextRequest, now() + 60000);
              throw new ProviderError("unavailable", 60000);
            }
            return data;
          } catch (error) {
            if (error instanceof ProviderError) throw error;
            if (error instanceof SyntaxError) throw new ProviderError("invalid_response");
            if (attempt === 1) throw new ProviderError("unavailable");
            nextRequest = Math.max(nextRequest, now() + 1000);
          } finally {
            clearTimeout(timer);
          }
        }
        throw new ProviderError("unavailable");
      } finally {
        busy = false;
      }
    },
  };
}
