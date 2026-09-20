import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bearerUser: vi.fn(),
  cookieUser: vi.fn(),
  createClient: vi.fn(),
  createServerClient: vi.fn(),
  cookies: vi.fn(),
  ensureProfile: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth/profile", () => ({ ensureUserProfile: mocks.ensureProfile }));

import { getCurrentUserId, requireApiUser } from "@/lib/auth/server";

const userId = "11111111-1111-4111-8111-111111111111";
const user = { id: userId, email: "person@example.com", user_metadata: { display_name: "Sam" } };
const token = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2ln";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_publictest");
  vi.stubEnv("APP_ORIGIN", "https://souvenir.example");
  vi.stubEnv("CORS_ORIGINS", "https://expo.example");
  vi.stubEnv("DEV_USER_ID", "22222222-2222-4222-8222-222222222222");
  mocks.createClient.mockReturnValue({ auth: { getUser: mocks.bearerUser } });
  mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.cookieUser } });
  mocks.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
  mocks.cookieUser.mockResolvedValue({ data: { user }, error: null });
  mocks.bearerUser.mockResolvedValue({ data: { user }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("verified API identity", () => {
  it.each([
    "",
    "Basic credentials",
    "Bearer",
    "Bearer invalid",
    `Bearer ${token}, Bearer ${token}`,
    `Bearer ${token} extra`,
  ])("rejects malformed authorization %s without cookie fallback", async (authorization) => {
    const result = await requireApiUser(
      new Request("https://souvenir.example/api/me", { headers: { authorization } }),
    );
    expect("response" in result && result.response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.cookieUser).not.toHaveBeenCalled();
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
  });

  it.each(["token_expired", "bad_jwt"])(
    "rejects %s without cookie or dev fallback",
    async (code) => {
      mocks.bearerUser.mockResolvedValue({ data: { user: null }, error: { code, status: 401 } });
      const result = await requireApiUser(
        new Request("https://souvenir.example/api/me", {
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      expect("response" in result && result.response.status).toBe(401);
      expect(mocks.bearerUser).toHaveBeenCalledWith(token);
      expect(mocks.cookies).not.toHaveBeenCalled();
      expect(mocks.ensureProfile).not.toHaveBeenCalled();
    },
  );

  it("verifies bearer and provisions only the verified UUID", async () => {
    const result = await requireApiUser(
      new Request("https://souvenir.example/api/me", {
        headers: { authorization: `Bearer ${token}`, origin: "https://expo.example" },
      }),
    );
    expect(result).toEqual({ auth: { userId, email: user.email, mode: "bearer" } });
    expect(mocks.bearerUser).toHaveBeenCalledWith(token);
    expect(mocks.cookieUser).not.toHaveBeenCalled();
    expect(mocks.ensureProfile).toHaveBeenCalledWith(
      { userId, email: user.email, mode: "bearer" },
      "Sam",
    );
  });

  it("verifies cookies with getUser and ignores DEV_USER_ID", async () => {
    expect(await getCurrentUserId()).toBe(userId);
    const result = await requireApiUser(new Request("https://souvenir.example/api/me"));
    expect(result).toEqual({ auth: { userId, email: user.email, mode: "cookie" } });
    expect(mocks.cookieUser).toHaveBeenCalledWith();
    expect(mocks.bearerUser).not.toHaveBeenCalled();
  });

  it("does not provision missing or anonymous identities", async () => {
    mocks.cookieUser.mockResolvedValue({ data: { user: null }, error: { status: 400 } });
    expect(await getCurrentUserId()).toBeNull();
    mocks.cookieUser.mockResolvedValue({
      data: { user: { ...user, is_anonymous: true } },
      error: null,
    });
    const result = await requireApiUser(new Request("https://souvenir.example/api/me"));
    expect("response" in result && result.response.status).toBe(401);
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
  });

  it("rejects cookie writes from other origins before touching auth", async () => {
    const result = await requireApiUser(
      new Request("https://souvenir.example/api/me", {
        method: "PATCH",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect("response" in result && result.response.status).toBe(403);
    expect(mocks.cookieUser).not.toHaveBeenCalled();
  });

  it("returns sanitized unavailable responses for auth and profile outages", async () => {
    mocks.bearerUser.mockResolvedValue({
      data: { user: null },
      error: { status: 503, message: "sensitive" },
    });
    const result = await requireApiUser(
      new Request("https://souvenir.example/api/me", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect("response" in result && result.response.status).toBe(503);
    if ("response" in result) expect(await result.response.text()).not.toContain("sensitive");
    mocks.ensureProfile.mockRejectedValue(new Error("private SQL"));
    const failedProfile = await requireApiUser(new Request("https://souvenir.example/api/me"));
    expect("response" in failedProfile && failedProfile.response.status).toBe(503);
  });

  it("returns usable errors when Supabase configuration is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const result = await requireApiUser(new Request("https://souvenir.example/api/me"));
    expect("response" in result && result.response.status).toBe(503);
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
  });
});
