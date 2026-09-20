import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  ensureProfile: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  getUserStats: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ requireApiUser: mocks.requireUser }));
vi.mock("@/lib/auth/profile", () => ({
  ensureUserProfile: mocks.ensureProfile,
  serializeProfile: (row: { createdAt: Date }) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }),
}));
vi.mock("@/lib/db", () => ({ db: { update: mocks.update } }));
vi.mock("@/lib/server/stats", () => ({ getUserStats: mocks.getUserStats }));
import { GET, PATCH } from "@/app/api/me/route";

const userId = "11111111-1111-4111-8111-111111111111";
const auth = { userId, email: "person@example.com", mode: "bearer" };
const profile = {
  id: userId,
  handle: "user_test",
  displayName: "Sam",
  homeCity: null,
  avatarUrl: null,
  createdAt: new Date("2026-09-20T00:00:00Z"),
};
const request = (body: string) =>
  new Request("https://souvenir.example/api/me", {
    method: "PATCH",
    body,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ auth });
  mocks.ensureProfile.mockResolvedValue({ ...profile, createdAt: profile.createdAt.toISOString() });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([profile]);
  mocks.getUserStats.mockResolvedValue(null);
});

it("returns only the verified profile using a private response", async () => {
  const response = await GET(new Request("https://souvenir.example/api/me"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ data: { id: userId, stats: null } });
  expect(mocks.ensureProfile).toHaveBeenCalledWith(auth);
  expect(mocks.getUserStats).toHaveBeenCalledWith(userId, userId);
});

it("requires auth for profile reads and updates", async () => {
  mocks.requireUser.mockImplementation(async () => ({
    response: Response.json({ error: "unauthorized" }, { status: 401 }),
  }));
  expect((await GET(new Request("https://souvenir.example/api/me"))).status).toBe(401);
  expect((await PATCH(request('{"displayName":"Changed"}'))).status).toBe(401);
  expect(mocks.ensureProfile).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("updates only approved fields with an owner predicate derived from auth", async () => {
  const response = await PATCH(request('{"displayName":"Changed","homeCity":null}'));
  expect(response.status).toBe(200);
  expect(mocks.set).toHaveBeenCalledWith({ displayName: "Changed", homeCity: null });
  const [condition] = mocks.where.mock.calls[0];
  const query = new PgDialect().sqlToQuery(condition);
  expect(query.sql).toBe('"users"."id" = $1');
  expect(query.params).toEqual([userId]);
});

it.each([
  '{"userId":"someone-else","displayName":"Changed"}',
  '{"id":"someone-else"}',
  '{"handle":"victim"}',
  "{}",
])("rejects caller identity, handles and empty updates", async (body) => {
  expect((await PATCH(request(body))).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects malformed JSON and reports failed writes without success", async () => {
  expect((await PATCH(request("{"))).status).toBe(400);
  mocks.returning.mockRejectedValue(new Error("private SQL connection details"));
  const response = await PATCH(request('{"displayName":"Changed"}'));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "service_unavailable",
    message: "Your changes were not saved. Please retry.",
  });
});
