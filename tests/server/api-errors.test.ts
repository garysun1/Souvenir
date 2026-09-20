import { afterEach, expect, it, vi } from "vitest";
import { apiRoute } from "@/lib/api";

vi.mock("@/lib/auth/server", () => ({ requireApiUser: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

it.each([
  ["53300", "too many connections"],
  [
    "XX000",
    "(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15",
  ],
])("returns a retryable response for database connection limits (%s)", async (code, message) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const error = Object.assign(new Error(message), { code });
  const response = await apiRoute(async () => {
    throw error;
  });

  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    error: "service_unavailable",
    message: "The service is unavailable. Please retry.",
  });
  expect(log).toHaveBeenCalledWith("Database connection limit reached", { code });
});

it.each([
  ["XX000", "private SQL query details"],
  ["28P01", "password authentication failed"],
])(
  "does not classify unrelated database failures as connection limits (%s)",
  async (code, message) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await apiRoute(async () => {
      throw Object.assign(new Error(message), { code });
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "internal_error",
      message: "The request could not be completed. Please retry.",
    });
    expect(log).not.toHaveBeenCalled();
  },
);
