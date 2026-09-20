import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/env";
import { addCorsHeaders, authError, validateRequestOrigin } from "@/lib/auth/http";

export async function middleware(request: NextRequest) {
  const api = request.nextUrl.pathname.startsWith("/api/");
  let response = NextResponse.next({ request });
  try {
    if (api) {
      const originError = validateRequestOrigin(request);
      if (originError) return addCorsHeaders(originError, request);
      if (request.method === "OPTIONS") {
        return addCorsHeaders(new NextResponse(null, { status: 204 }), request);
      }
    }
    if (!request.headers.has("authorization")) {
      const { url, publishableKey } = getSupabaseConfig();
      const client = createServerClient(url, publishableKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      });
      await client.auth.getUser();
    }
    response.headers.set("Cache-Control", "private, no-store");
    return api ? addCorsHeaders(response, request) : response;
  } catch {
    if (api) {
      const errorResponse = authError(
        503,
        "service_unavailable",
        "Account services are unavailable. Please retry.",
      );
      try {
        return addCorsHeaders(errorResponse, request);
      } catch {
        return errorResponse;
      }
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
