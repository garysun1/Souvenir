import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountScope, ApiError, requestJson } from "@/lib/web/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("account-scoped transport", () => {
  it("invalidates requests through sign-out and a return to the same account", () => {
    const scope = new AccountScope();
    scope.switchTo("first");
    const initial = scope.capture();
    scope.switchTo("first");
    expect(initial.signal.aborted).toBe(false);
    scope.switchTo(null);
    scope.switchTo("first");
    expect(initial.signal.aborted).toBe(true);
    expect(() => initial.assertCurrent()).toThrow("Account changed");
    expect(scope.capture().signal.aborted).toBe(false);
  });

  it("retries one unauthorized write after refresh with the identical body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "unauthorized" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ data: { id: "saved" } }));
    vi.stubGlobal("fetch", fetchMock);
    const body = { requestId: "stable", note: "original" };
    const refreshSession = vi.fn(async () => {
      body.note = "changed later";
      return true;
    });
    expect(await requestJson("/api/editions", { method: "POST", body, refreshSession })).toEqual({
      id: "saved",
    });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: '{"requestId":"stable","note":"original"}',
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("requires sign-in when the refreshed session is still unauthorized", async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: "unauthorized" }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const refreshSession = vi.fn(async () => true);
    await expect(requestJson("/api/bootstrap", { refreshSession })).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("does not replay when session refresh fails", async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: "unauthorized" }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      requestJson("/api/bootstrap", { refreshSession: async () => false }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discards a response whose account changed during JSON decoding", async () => {
    const scope = new AccountScope();
    scope.switchTo("first");
    const response = Response.json({ data: { note: "private" } });
    vi.spyOn(response, "json").mockImplementation(async () => {
      scope.switchTo("second");
      return { data: { note: "private" } };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    await expect(requestJson("/api/bootstrap", scope.capture())).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("never replays a write under the replacement account after refresh", async () => {
    const scope = new AccountScope();
    scope.switchTo("first");
    const fetchMock = vi.fn(async () => Response.json({ error: "unauthorized" }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      requestJson("/api/editions", {
        ...scope.capture(),
        method: "POST",
        body: { requestId: "stable" },
        refreshSession: async () => {
          scope.switchTo("second");
          return true;
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps API error codes and messages rather than treating failures as saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "idempotency_conflict", message: "Use the original draft." },
          { status: 409 },
        ),
      ),
    );
    await expect(requestJson("/api/editions")).rejects.toMatchObject({
      code: "idempotency_conflict",
      status: 409,
      message: "Use the original draft.",
    });
  });

  it.each([
    () => new Response("not JSON", { status: 502 }),
    () => Response.json({ unexpected: true }),
    () => Response.json({ data: "not saved" }, { status: 503 }),
  ])("rejects unreadable, missing or failed success envelopes", async (response) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    await expect(requestJson("/api/bootstrap")).rejects.toBeInstanceOf(ApiError);
  });

  it("reports network failures without automatic duplicate writes", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Network offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestJson("/api/editions", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "service_unavailable",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
