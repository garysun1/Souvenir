import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), exchange: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ createSupabaseServerClient: mocks.createClient }));
import { GET as callback } from "@/app/auth/callback/route";
import { GET as confirm } from "@/app/auth/confirm/route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_ORIGIN", "https://souvenir.example");
  mocks.createClient.mockResolvedValue({
    auth: { exchangeCodeForSession: mocks.exchange, verifyOtp: mocks.verify },
  });
  mocks.exchange.mockResolvedValue({ data: {}, error: null });
  mocks.verify.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("exchanges a code and sends only safe relative destinations to the configured origin", async () => {
  const response = await callback(
    new Request("https://untrusted-host.example/auth/callback?code=code&next=https://evil.example"),
  );
  expect(mocks.exchange).toHaveBeenCalledWith("code");
  expect(response.headers.get("location")).toBe("https://souvenir.example/collection");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("preserves a requested collection detail path after confirmation", async () => {
  const response = await confirm(
    new Request(
      "https://souvenir.example/auth/confirm?token_hash=token&type=signup&next=/places/griffith",
    ),
  );
  expect(mocks.verify).toHaveBeenCalledWith({ token_hash: "token", type: "signup" });
  expect(response.headers.get("location")).toBe("https://souvenir.example/places/griffith");
});

it("routes failed or expired confirmation to a usable login error", async () => {
  mocks.exchange.mockResolvedValue({ data: {}, error: new Error("expired") });
  const response = await callback(
    new Request("https://souvenir.example/auth/callback?code=expired"),
  );
  expect(response.headers.get("location")).toBe(
    "https://souvenir.example/login?error=confirmation",
  );
});

it.each(["", "?token_hash=x&type=recovery", "?token_hash=x&type=magiclink", "?type=email"])(
  "rejects unsupported or incomplete confirmation input",
  async (query) => {
    const response = await confirm(new Request(`https://souvenir.example/auth/confirm${query}`));
    expect(response.headers.get("location")).toBe(
      "https://souvenir.example/login?error=confirmation",
    );
    expect(mocks.verify).not.toHaveBeenCalled();
  },
);

it("does not exchange a code accompanying an auth error", async () => {
  const response = await callback(
    new Request("https://souvenir.example/auth/callback?error=access_denied&code=x"),
  );
  expect(response.headers.get("location")).toBe(
    "https://souvenir.example/login?error=confirmation",
  );
  expect(mocks.exchange).not.toHaveBeenCalled();
});
