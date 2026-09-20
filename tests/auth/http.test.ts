import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { addCorsHeaders, validateRequestOrigin } from "@/lib/auth/http";
import { safeRedirect } from "@/lib/auth/redirect";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
import { middleware } from "@/middleware";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_ORIGIN", "https://souvenir.example");
  vi.stubEnv("CORS_ORIGINS", "https://expo.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "/%2f%2fevil.example",
  "/%5cevil.example",
  "/\nevil",
  "/%0devil",
  "/auth/callback",
  "/login",
  null,
  "javascript:alert(1)",
])("rejects unsafe return path %s", (value) => {
  expect(safeRedirect(value)).toBe("/collection");
});

it("preserves a relative destination and query", () => {
  expect(safeRedirect("/places/griffith-observatory?tab=visits#notes")).toBe(
    "/places/griffith-observatory?tab=visits#notes",
  );
});

it.each([undefined, "https://evil.example", "null", "https://expo.example"])(
  "rejects cookie writes with origin %s",
  (origin) => {
    const request = new Request("https://souvenir.example/api/me", {
      method: "PATCH",
      headers: origin ? { origin } : {},
    });
    expect(validateRequestOrigin(request)?.status).toBe(403);
  },
);

it("accepts same-origin cookie writes and native bearer writes", () => {
  expect(
    validateRequestOrigin(
      new Request("https://souvenir.example/api/me", {
        method: "PATCH",
        headers: { origin: "https://souvenir.example" },
      }),
    ),
  ).toBeNull();
  expect(
    validateRequestOrigin(
      new Request("https://souvenir.example/api/me", {
        method: "PATCH",
        headers: { authorization: "Bearer abc" },
      }),
    ),
  ).toBeNull();
});

it("answers allowed bearer preflight without cookies or credentials CORS", async () => {
  const response = await middleware(
    new NextRequest("https://souvenir.example/api/me", {
      method: "OPTIONS",
      headers: {
        origin: "https://expo.example",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type, authorization",
      },
    }),
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe("https://expo.example");
  expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  expect(mocks.createServerClient).not.toHaveBeenCalled();
});

it("rejects unapproved preflights and does not add permissive CORS", async () => {
  const request = new NextRequest("https://souvenir.example/api/me", {
    method: "OPTIONS",
    headers: { origin: "https://evil.example", "access-control-request-headers": "authorization" },
  });
  const response = await middleware(request);
  expect(response.status).toBe(403);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
  expect(addCorsHeaders(NextResponse.json({}), request).headers.get("vary")).toContain("Origin");
});

it("preserves refreshed response cookies and forwards refreshed request cookies", async () => {
  mocks.createServerClient.mockImplementation(
    (
      _url,
      _key,
      options: {
        cookies: {
          setAll: (
            values: { name: string; value: string; options: { path: string; httpOnly: boolean } }[],
          ) => void;
        };
      },
    ) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            { name: "sb-test", value: "refreshed", options: { path: "/", httpOnly: true } },
          ]);
          return { data: { user: null }, error: null };
        },
      },
    }),
  );
  const request = new NextRequest("https://souvenir.example/collection");
  const response = await middleware(request);
  expect(response.cookies.get("sb-test")?.value).toBe("refreshed");
  expect(request.cookies.get("sb-test")?.value).toBe("refreshed");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
