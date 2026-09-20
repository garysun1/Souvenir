import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import type { ErrorCode } from "../../../shared/api-contract";

export function authError(status: number, error: ErrorCode, message: string): NextResponse {
  return NextResponse.json(
    { error, message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export function validateRequestOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  const bearer =
    request.headers.has("authorization") ||
    (request.method === "OPTIONS" &&
      request.headers
        .get("access-control-request-headers")
        ?.toLowerCase()
        .split(",")
        .some((header) => header.trim() === "authorization"));
  if (origin && origin !== env.APP_ORIGIN) {
    if (!bearer || !env.CORS_ORIGINS.includes(origin)) {
      return authError(403, "forbidden", "This origin cannot access your account.");
    }
  }
  if (
    !bearer &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    origin !== env.APP_ORIGIN
  ) {
    return authError(403, "forbidden", "Reload the app before trying this action again.");
  }
  return null;
}

export function addCorsHeaders(response: NextResponse, request: Request): NextResponse {
  const origin = request.headers.get("origin");
  response.headers.append("Vary", "Origin");
  if (origin && env.CORS_ORIGINS.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.headers.set("Access-Control-Max-Age", "600");
  }
  return response;
}
