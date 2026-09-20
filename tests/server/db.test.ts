import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postgres: vi.fn(),
  drizzle: vi.fn(),
  end: vi.fn(),
}));
vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: mocks.drizzle }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal("souvenirSql", undefined);
  mocks.postgres.mockImplementation(() => ({ end: mocks.end }));
});

afterEach(() => vi.unstubAllGlobals());

it("reuses one connection pool across server module reloads", async () => {
  for (let reload = 0; reload < 5; reload++) {
    vi.resetModules();
    await import("@/lib/db");
  }

  expect(mocks.postgres).toHaveBeenCalledTimes(1);
  const client = mocks.postgres.mock.results[0].value;
  for (const [connection] of mocks.drizzle.mock.calls) {
    expect(connection).toBe(client);
  }
});

it("bounds the pool and releases idle connections", async () => {
  const { closeDb } = await import("@/lib/db");

  expect(mocks.postgres).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ max: 1, prepare: false, idle_timeout: 20 }),
  );
  await closeDb();
  expect(mocks.end).toHaveBeenCalledOnce();

  vi.resetModules();
  await import("@/lib/db");
  expect(mocks.postgres).toHaveBeenCalledTimes(2);
});
