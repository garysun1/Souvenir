import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listImports, POST as createImport } from "@/app/api/imports/route";
import { GET as getBatch, DELETE as deleteBatch } from "@/app/api/imports/[batchId]/route";
import { POST as registerItem } from "@/app/api/imports/[batchId]/items/route";
import {
  PATCH as patchItem,
  DELETE as deleteItem,
} from "@/app/api/imports/[batchId]/items/[itemId]/route";
import { POST as completeItem } from "@/app/api/imports/[batchId]/items/[itemId]/complete/route";
import { GET as itemPhoto } from "@/app/api/imports/[batchId]/items/[itemId]/photo/route";
import { POST as analyzeImport } from "@/app/api/imports/[batchId]/analyze/route";
import { POST as commitImport } from "@/app/api/imports/[batchId]/commit/route";
import { GET as getTaste, PATCH as patchTaste, DELETE as deleteTaste } from "@/app/api/taste/route";
import { POST as analyzeTaste } from "@/app/api/taste/analyze/route";
import { POST as publishTaste } from "@/app/api/taste/publish/route";
import { GET as getShared } from "@/app/api/users/[userId]/taste/route";
import { GET as compare } from "@/app/api/users/[userId]/taste-comparison/route";

const service = vi.hoisted(() => ({
  list: vi.fn(async () => ({ items: [], nextCursor: null })),
  taste: vi.fn(async () => ({ version: 1 })),
  compare: vi.fn(async () => ({ commonInterests: [] })),
}));
vi.mock("@/lib/auth/server", () => ({
  requireApiUser: async (request: Request) => {
    const userId = request.headers.get("x-test-user");
    return userId
      ? { auth: { userId, email: null, mode: "bearer" } }
      : { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  },
}));
vi.mock("@/lib/server/memory-imports", () => ({
  listImportBatches: service.list,
  createImportBatch: vi.fn(),
  getImportBatch: vi.fn(),
  deleteImport: vi.fn(),
  registerImportItem: vi.fn(),
  patchImportItem: vi.fn(),
  completeImportItem: vi.fn(),
  getImportPhoto: vi.fn(),
  analyzeImport: vi.fn(),
  commitImport: vi.fn(),
}));
vi.mock("@/lib/server/taste", () => ({
  getTaste: service.taste,
  patchTaste: vi.fn(),
  deleteTaste: vi.fn(),
  analyzeTaste: vi.fn(),
  publishTaste: vi.fn(),
}));
vi.mock("@/lib/server/taste-comparison", () => ({
  getSharedTaste: vi.fn(),
  getTasteComparison: service.compare,
}));
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ batchId: id, itemId: other }) };
const userContext = { params: Promise.resolve({ userId: other }) };
const request = (method = "GET", suffix = "", body?: string, userId = id) =>
  new Request(`https://souvenir.test/api/test${suffix}`, {
    method,
    headers: userId ? { "x-test-user": userId } : {},
    ...(body === undefined ? {} : { body }),
  });

beforeEach(() => vi.clearAllMocks());

describe("authenticated route boundary", () => {
  const routes = [
    (r: Request) => listImports(r),
    (r: Request) => createImport(r),
    (r: Request) => getBatch(r, context),
    (r: Request) => deleteBatch(r, context),
    (r: Request) => registerItem(r, context),
    (r: Request) => patchItem(r, context),
    (r: Request) => deleteItem(r, context),
    (r: Request) => completeItem(r, context),
    (r: Request) => itemPhoto(r, context),
    (r: Request) => analyzeImport(r, context),
    (r: Request) => commitImport(r, context),
    (r: Request) => getTaste(r),
    (r: Request) => patchTaste(r),
    (r: Request) => deleteTaste(r),
    (r: Request) => analyzeTaste(r),
    (r: Request) => publishTaste(r),
    (r: Request) => getShared(r, userContext),
    (r: Request) => compare(r, userContext),
  ];
  it.each(routes)(
    "requires a verified actor and returns private/no-store for every endpoint",
    async (route) => {
      const response = await route(request("POST", "", "{}", ""));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(service.list).not.toHaveBeenCalled();
      expect(service.taste).not.toHaveBeenCalled();
      expect(service.compare).not.toHaveBeenCalled();
    },
  );
  it("accepts bounded pagination but rejects unknown, repeated and over-limit queries", async () => {
    expect((await listImports(request("GET", "?limit=2"))).status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ userId: id }), {
      limit: 2,
    });
    for (const suffix of ["?limit=51", "?limit=2&limit=3", "?ownerId=foreign"])
      expect((await listImports(request("GET", suffix))).status).toBe(400);
  });
  it("validates strict bodies and image consent", async () => {
    for (const body of [
      "{",
      "{}",
      JSON.stringify({
        requestId: id,
        expectedVersion: 1,
        itemIds: [other],
        consentImages: false,
      }),
    ]) {
      const response = await analyzeImport(request("POST", "", body), context);
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(
      (
        await publishTaste(
          request(
            "POST",
            "",
            JSON.stringify({
              expectedVersion: 1,
              sharing: "friends",
              title: null,
              facets: [],
              collageMomentIds: [],
              confirmShare: false,
            }),
          ),
        )
      ).status,
    ).toBe(400);
  });
  it("passes the current authenticated actor on each request without retaining account state", async () => {
    await getTaste(request());
    await getTaste(request("GET", "", undefined, other));
    expect(service.taste.mock.calls).toEqual([
      [{ userId: id, email: null, mode: "bearer" }],
      [{ userId: other, email: null, mode: "bearer" }],
    ]);
  });
  it("accepts explicit area filters only through the comparison schema", async () => {
    expect((await compare(request("GET", "?city=Paris&country=FR"), userContext)).status).toBe(200);
    expect(service.compare).toHaveBeenCalledWith(expect.objectContaining({ userId: id }), other, {
      city: "Paris",
      country: "FR",
    });
    expect((await compare(request("GET", "?city=Paris"), userContext)).status).toBe(400);
    expect((await getTaste(request("GET", "?include=private"))).status).toBe(400);
  });
});
