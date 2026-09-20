import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthApiError, createClient } from "@supabase/supabase-js";
import { env, getPublicEnv, getSupabaseConfig } from "@/lib/env";
import { authenticateWithPassword } from "@/lib/auth/client";
import { createSupabaseBrowserClient } from "@/lib/auth/browser";

const mocks = vi.hoisted(() => ({ createBrowserClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createBrowserClient: mocks.createBrowserClient }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_clienttest");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("SUPABASE_DATABASE_URL", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret-sentinel");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-role-sentinel");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("imports public configuration and browser client without database configuration", () => {
  vi.stubGlobal("window", {});
  expect(getPublicEnv()).toEqual({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_clienttest",
  });
  createSupabaseBrowserClient();
  expect(mocks.createBrowserClient).toHaveBeenCalledWith(
    "https://example.supabase.co",
    "sb_publishable_clienttest",
  );
  expect(() => env.DATABASE_URL).toThrow("Server configuration is unavailable");
  expect(() => env.SUPABASE_SECRET_KEY).toThrow("Server configuration is unavailable");
  expect(JSON.stringify(getPublicEnv())).not.toContain("server-");
});

it("does not accept a server secret as the browser key", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_test");
  expect(() => getPublicEnv()).toThrow("public Supabase configuration is invalid");
});

it("gives a usable missing config error without leaking values", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  expect(() => getSupabaseConfig()).toThrow("Sign-in is unavailable");
});

it("treats signup without a session as confirmation required", async () => {
  const client = createClient("https://example.supabase.co", "sb_publishable_test", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signup = vi
    .spyOn(client.auth, "signUp")
    .mockResolvedValue({ data: { user: null, session: null }, error: null });
  expect(
    await authenticateWithPassword(client, {
      email: " person@example.com ",
      password: "valid-password",
      signup: true,
      callbackUrl: "https://souvenir.example/auth/callback",
    }),
  ).toBe("confirmation_required");
  expect(signup).toHaveBeenCalledWith({
    email: "person@example.com",
    password: "valid-password",
    options: { emailRedirectTo: "https://souvenir.example/auth/callback" },
  });
});

it("surfaces invalid credentials without claiming success", async () => {
  const client = createClient("https://example.supabase.co", "sb_publishable_test", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  vi.spyOn(client.auth, "signInWithPassword").mockResolvedValue({
    data: { user: null, session: null },
    error: new AuthApiError("internal detail", 400, "invalid_credentials"),
  });
  await expect(
    authenticateWithPassword(client, {
      email: "person@example.com",
      password: "valid-password",
      signup: false,
      callbackUrl: "",
    }),
  ).rejects.toThrow("The email or password is incorrect");
});
