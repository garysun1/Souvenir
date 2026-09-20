import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountScope, requestJson } from "@/lib/web/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("worldwide transport boundaries", () => {
  it("preserves safe duplicate details for an explicit existing-place choice", async () => {
    const details = {
      kind: "duplicate",
      existingPlace: { id: "canonical-id", slug: "already-here" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "conflict", message: "Review this existing place.", details },
          { status: 409 },
        ),
      ),
    );
    await expect(requestJson("/api/places", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 409,
      details,
    });
  });

  it("preserves distinct permission, missing and unavailable errors", async () => {
    for (const [status, code] of [
      [403, "forbidden"],
      [404, "not_found"],
      [503, "service_unavailable"],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ error: code, message: code }, { status })),
      );
      await expect(requestJson("/api/users/profile")).rejects.toMatchObject({ code, status });
    }
  });

  it("drops a cancelled search even if the network ignores abort", async () => {
    const controller = new AbortController();
    const response = Response.json({ data: ["stale result"] });
    vi.spyOn(response, "json").mockImplementation(async () => {
      controller.abort();
      return { data: ["stale result"] };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    const pagination = vi.fn();
    await expect(
      requestJson("/api/places/search?q=old", {
        signal: controller.signal,
        onPagination: pagination,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(pagination).not.toHaveBeenCalled();
  });

  it("does not replay a cancelled request after authentication refresh", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => Response.json({ error: "unauthorized" }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      requestJson("/api/places/search?q=old", {
        signal: controller.signal,
        refreshSession: async () => {
          controller.abort();
          return true;
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["query", "account"] as const)(
    "honors both abort scopes when the %s changes",
    async (change) => {
      const scope = new AccountScope();
      scope.switchTo("viewer");
      const account = scope.capture();
      const query = new AbortController();
      const signal = AbortSignal.any([account.signal, query.signal]);
      if (change === "query") query.abort();
      else scope.switchTo("replacement");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(requestJson("/api/places", { ...account, signal })).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(scope.userId).toBe(change === "query" ? "viewer" : "replacement");
    },
  );

  it("keeps catalog pagination separate from data and does not cache viewer responses", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ slug: "lisbon" }], nextCursor: "opaque-cursor" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pagination = vi.fn();
    expect(
      await requestJson("/api/places?city=Lisbon&country=PT", { onPagination: pagination }),
    ).toEqual([{ slug: "lisbon" }]);
    expect(pagination).toHaveBeenCalledWith("opaque-cursor");
    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/places?city=Lisbon&country=PT",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    ]);
  });
});
