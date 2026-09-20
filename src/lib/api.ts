import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/server";
import { ApiError } from "@/lib/server/errors";
import type { AuthContext } from "../../shared/api-contract";
import type { Created } from "@/lib/server/transactions";

const maxBodyBytes = 1024 * 1024;

async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBodyBytes) {
      await reader.cancel();
      throw new ApiError(413, "payload_too_large", "The request is too large.");
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(request));
  } catch (error) {
    if (error instanceof ApiError) return { response: apiErrorResponse(error) };
    return { response: NextResponse.json({ error: "invalid_json" }, { status: 400 }) };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: "invalid_request", details: parsed.error.flatten() },
        { status: 400 },
      ),
    };
  }
  return { data: parsed.data };
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "invalid_request", details: error.flatten() },
      { status: 400 },
    );
  }
  const unavailable =
    error instanceof Error &&
    "code" in error &&
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "CONNECTION_CLOSED",
      "CONNECT_TIMEOUT",
    ].includes(String(error.code));
  return NextResponse.json(
    {
      error: unavailable ? "service_unavailable" : "internal_error",
      message: unavailable
        ? "The service is unavailable. Please retry."
        : "The request could not be completed. Please retry.",
    },
    { status: unavailable ? 503 : 500 },
  );
}

export async function apiRoute(handler: () => Promise<Response>): Promise<Response> {
  let response: Response;
  try {
    response = await handler();
  } catch (error) {
    response = apiErrorResponse(error);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function withApiUser(
  request: Request,
  handler: (auth: AuthContext) => Promise<Response>,
): Promise<Response> {
  return apiRoute(async () => {
    const result = await requireApiUser(request);
    if ("response" in result) return result.response;
    requireNoQuery(request);
    return handler(result.auth);
  });
}

export function requireNoQuery(request: Request): void {
  if ([...new URL(request.url).searchParams].length) {
    throw new ApiError(400, "invalid_request", "This endpoint does not accept query parameters.");
  }
}

export function dataResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function createdResponse<T>(result: Created<T>): NextResponse {
  return dataResponse(result.data, result.created ? 201 : 200);
}

export const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type IdParams = { params: Promise<{ id: string }> };
export type PlaceIdParams = { params: Promise<{ placeId: string }> };
export type SlugParams = { params: Promise<{ slug: string }> };
