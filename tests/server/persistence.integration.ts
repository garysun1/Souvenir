import { randomUUID } from "node:crypto";
import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "@/lib/db";
import {
  users,
  places,
  editions,
  apiRequests,
  editionCounters,
  wishlists,
  outingMembers,
  outings,
} from "@/lib/db/schema";
import { getBootstrap } from "@/lib/data";
import {
  createEdition,
  getCollection,
  getEdition,
  updateEdition,
  deleteEdition,
} from "@/lib/server/editions";
import {
  createWishlist,
  addWishlistMember,
  removeWishlistMember,
  putWishlistItem,
  getWishlist,
  getWishlists,
  getWishlistOverlap,
} from "@/lib/server/wishlists";
import { createPlan, updatePlan, deletePlan, getPlans } from "@/lib/server/plans";
import {
  putRanking,
  getRankings,
  getPlacePreferences,
  putPlacePreference,
} from "@/lib/server/rankings";
import { ApiError } from "@/lib/server/errors";
import { signCapturePhoto, verifyCapturePhoto, deleteCapturePhoto } from "@/lib/auth/storage";
import { POST as postEdition } from "@/app/api/editions/route";
import {
  GET as readEdition,
  PATCH as patchEdition,
  DELETE as removeEdition,
} from "@/app/api/editions/[id]/route";
import { GET as catalog } from "@/app/api/places/route";
import { GET as readPlace } from "@/app/api/places/[slug]/route";
import { GET as bootstrap } from "@/app/api/bootstrap/route";
import { POST as search } from "@/app/api/search/route";
import { POST as identify } from "@/app/api/capture/identify/route";
import { POST as previewPlan } from "@/app/api/plan/route";
import { POST as importDropbox } from "@/app/api/import/dropbox/route";
import { POST as legacySave } from "@/app/api/wishlists/[id]/items/route";
import type {
  AuthContext,
  EditionCreate,
  PlanContent,
  RankingGroupDto,
} from "../../shared/api-contract";

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: async (request: Request) => {
    const userId = request.headers.get("x-test-user");
    return userId
      ? { auth: { userId, email: null, mode: "bearer" } }
      : { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  },
  getCurrentUserId: async () => null,
}));
vi.mock("@/lib/auth/storage", () => ({
  verifyCapturePhoto: vi.fn(async () => ({ size: 1024, contentType: "image/jpeg" })),
  signCapturePhoto: vi.fn(async (_auth: AuthContext, path: string) => ({
    path,
    url: `https://photos.test/${path}?token=${randomUUID()}`,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  })),
  deleteCapturePhoto: vi.fn(async () => undefined),
}));

const alice: AuthContext = { userId: randomUUID(), email: null, mode: "bearer" };
const bob: AuthContext = { userId: randomUUID(), email: null, mode: "cookie" };
const eve: AuthContext = { userId: randomUUID(), email: null, mode: "bearer" };
const placeIds = Array.from({ length: 35 }, () => randomUUID());
const placeId = placeIds[0];
const secondPlace = placeIds[1];

function capture(overrides: Partial<EditionCreate> = {}): EditionCreate {
  return {
    requestId: randomUUID(),
    placeId,
    capturedAt: "2026-09-19T14:00:00Z",
    timezone: "America/Los_Angeles",
    ...overrides,
  };
}
function plan(participantIds = [alice.userId]): PlanContent {
  return {
    title: "A test outing",
    constraints: {
      participantIds,
      date: "2026-09-20",
      startMinute: 600,
      endMinute: 900,
      budgetCents: 2000,
      transport: "walk",
      interests: ["nature"],
      rain: false,
      excludedPlaceIds: [],
      preferredPlaceIds: [],
    },
    stops: [
      { placeId, arrivalMinute: 610, departureMinute: 670, travelMinutes: 10, costCents: 500 },
    ],
    totalCostCents: 500,
    totalMinutes: 70,
    checks: [],
    version: 1,
    provenance: "manual",
  };
}
function request(path: string, method = "GET", body?: unknown, auth: AuthContext | null = alice) {
  return new Request(`https://souvenir.test/api${path}`, {
    method,
    headers: {
      ...(auth ? { "x-test-user": auth.userId } : {}),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.execute(sql`TRUNCATE users, places CASCADE`);
  await db.insert(users).values([
    { id: alice.userId, handle: "alice", displayName: "Alice" },
    { id: bob.userId, handle: "bob", displayName: "Bob" },
    { id: eve.userId, handle: "eve", displayName: "Eve" },
  ]);
  await db.insert(places).values(
    placeIds.map((id, index) => ({
      id,
      slug: `test-place-${index}`,
      name: `Place ${index}`,
      category: index === 34 ? ("food" as const) : ("nature" as const),
      lat: 34,
      lng: -118,
      city: "Los Angeles",
      description: "Test catalog",
      rarityTier: "common" as const,
      rarityAppeal: 0,
      rarityAvailability: 0,
      rarityDiscoveryFreq: 0,
    })),
  );
});
afterAll(closeDb);

describe("transactional persistence on disposable PostgreSQL", () => {
  it("collapses parallel retries but gives independent revisits monotonically increasing sequences", async () => {
    const input = capture();
    const retries = await Promise.all(
      Array.from({ length: 12 }, () => createEdition(alice, input)),
    );
    expect(new Set(retries.map(({ data }) => data.id)).size).toBe(1);
    expect(retries.filter(({ created }) => created)).toHaveLength(1);
    expect(retries[0].data.visitSequence).toBe(1);
    const revisits = await Promise.all(
      Array.from({ length: 18 }, () => createEdition(alice, capture())),
    );
    expect(revisits.map(({ data }) => data.visitSequence).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 2),
    );
    expect((await getCollection(alice)).map((entry) => entry.place.id)).toEqual(
      Array(19).fill(placeId),
    );
    const last = revisits.find(({ data }) => data.visitSequence === 19)!;
    await deleteEdition(alice, last.data.id);
    expect((await createEdition(alice, capture())).data.visitSequence).toBe(20);
    expect(await db.select().from(places)).toHaveLength(35);
  });

  it("uses normalized requests, rejects changed payloads and cross-operation keys, and retains tombstones", async () => {
    const input = capture();
    const original = await createEdition(alice, input);
    const replay = await createEdition(alice, {
      ...input,
      capturedAt: "2026-09-19T07:00:00-07:00",
      companions: [],
      note: null,
      variant: "standard",
    });
    expect(replay.created).toBe(false);
    expect(replay.data.id).toBe(original.data.id);
    await expect(createEdition(alice, { ...input, note: "Changed" })).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      createWishlist(alice.userId, { requestId: input.requestId, name: "Reuse" }),
    ).rejects.toMatchObject({ status: 409 });
    await deleteEdition(alice, original.data.id);
    await expect(createEdition(alice, input)).rejects.toMatchObject({
      status: 410,
      code: "resource_deleted",
    });
    const other = await createEdition(bob, input);
    expect(other.data.id).not.toBe(original.data.id);
    expect(other.data.visitSequence).toBe(1);
  });

  it("rolls back request reservation and counters when validation or photo verification fails", async () => {
    const input = capture({ placeId: randomUUID() });
    await expect(createEdition(alice, input)).rejects.toMatchObject({ status: 400 });
    expect(await db.select().from(apiRequests)).toHaveLength(0);
    expect(await db.select().from(editionCounters)).toHaveLength(0);
    const path = `${alice.userId}/${input.requestId}.jpg`;
    vi.mocked(verifyCapturePhoto).mockRejectedValueOnce(
      new ApiError(422, "photo_not_uploaded", "Missing"),
    );
    await expect(
      createEdition(alice, { ...input, placeId, photoPath: path }),
    ).rejects.toMatchObject({ status: 422 });
    expect(await db.select().from(apiRequests)).toHaveLength(0);
    expect(await db.select().from(editions)).toHaveLength(0);
    expect(
      (await createEdition(alice, { ...input, placeId, photoPath: path })).data.visitSequence,
    ).toBe(1);
  });

  it("deduplicates imports across draft keys and preserves that identity after deletion", async () => {
    const input = capture({ origin: "import", importSourceId: "real-provider:item-42" });
    const first = await createEdition(alice, input);
    expect((await createEdition(alice, input)).data.id).toBe(first.data.id);
    await expect(createEdition(alice, { ...input, requestId: randomUUID() })).rejects.toMatchObject(
      { status: 409 },
    );
    await deleteEdition(alice, first.data.id);
    await expect(createEdition(alice, { ...input, requestId: randomUUID() })).rejects.toMatchObject(
      { status: 410 },
    );
    expect((await createEdition(bob, input)).created).toBe(true);
  });

  it("rolls back allocated sequences and parent rows when database child inserts fail", async () => {
    await db.execute(sql`
      CREATE FUNCTION reject_test_insert() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'Injected insert failure'; END $$;
      CREATE TRIGGER reject_test_edition BEFORE INSERT ON editions
      FOR EACH ROW EXECUTE FUNCTION reject_test_insert();
      CREATE TRIGGER reject_test_member BEFORE INSERT ON outing_members
      FOR EACH ROW EXECUTE FUNCTION reject_test_insert();
    `);
    const visit = capture();
    const outing = { requestId: randomUUID(), plan: plan() };
    try {
      await expect(createEdition(alice, visit)).rejects.toThrow("Injected insert failure");
      await expect(createPlan(alice.userId, outing)).rejects.toThrow("Injected insert failure");
      expect(await db.select().from(apiRequests)).toHaveLength(0);
      expect(await db.select().from(editionCounters)).toHaveLength(0);
      expect(await db.select().from(editions)).toHaveLength(0);
      expect(await db.select().from(outings)).toHaveLength(0);
      expect(await db.select().from(outingMembers)).toHaveLength(0);
    } finally {
      await db.execute(sql`
        DROP TRIGGER reject_test_edition ON editions;
        DROP TRIGGER reject_test_member ON outing_members;
        DROP FUNCTION reject_test_insert();
      `);
    }
    expect((await createEdition(alice, visit)).data.visitSequence).toBe(1);
    expect((await createPlan(alice.userId, outing)).created).toBe(true);
  });

  it("enforces edition ownership and preserves unspecified metadata when editing", async () => {
    const saved = await createEdition(alice, capture({ note: "Private", companions: ["Friend"] }));
    await expect(getEdition(bob, saved.data.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateEdition(bob, saved.data.id, { note: "Overwrite" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(deleteEdition(bob, saved.data.id)).rejects.toMatchObject({ status: 404 });
    expect(await getCollection(bob)).toEqual([]);
    const changed = await updateEdition(alice, saved.data.id, {
      note: null,
      capturedAt: "2026-09-18T01:00:00Z",
    });
    expect(changed).toMatchObject({
      companions: ["Friend"],
      note: null,
      capturedAt: "2026-09-18T01:00:00.000Z",
      requestId: saved.data.requestId,
    });
    await expect(
      createEdition({ ...alice, userId: randomUUID() }, capture()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("signs fresh photo reads and retries cleanup without restoring deleted rows", async () => {
    const input = capture();
    input.photoPath = `${alice.userId}/${input.requestId}.jpg`;
    const saved = await createEdition(alice, input);
    const retried = await createEdition(alice, input);
    expect(saved.data.photo?.path).toBe(input.photoPath);
    expect(retried.data.photo?.url).not.toBe(saved.data.photo?.url);
    expect(verifyCapturePhoto).toHaveBeenCalledTimes(1);
    expect(signCapturePhoto).toHaveBeenCalledWith(alice, input.photoPath);
    vi.mocked(deleteCapturePhoto).mockRejectedValueOnce(
      new ApiError(503, "service_unavailable", "Unavailable"),
    );
    await expect(deleteEdition(alice, saved.data.id)).rejects.toMatchObject({ status: 503 });
    expect(await getCollection(alice)).toEqual([]);
    await expect(createEdition(alice, input)).rejects.toMatchObject({ status: 410 });
    await expect(deleteEdition(alice, saved.data.id)).resolves.toEqual({ deleted: true });
    expect(deleteCapturePhoto).toHaveBeenCalledTimes(2);
    await expect(deleteEdition(bob, saved.data.id)).rejects.toMatchObject({ status: 404 });
  });

  it("bootstraps a complete catalog and one default list under concurrent refreshes", async () => {
    await createEdition(alice, capture());
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => getBootstrap(alice.userId)),
    );
    expect(responses.every((entry) => entry.places.length === 35)).toBe(true);
    expect(
      new Set(responses.map((entry) => entry.wishlists.find((list) => list.isDefault)?.id)).size,
    ).toBe(1);
    expect(
      await db.select().from(wishlists).where(eq(wishlists.ownerId, alice.userId)),
    ).toHaveLength(1);
    expect(responses[0].collection).toHaveLength(1);
    const foreign = await getBootstrap(bob.userId);
    expect(foreign.collection).toEqual([]);
    expect(foreign.wishlists[0].id).not.toBe(responses[0].wishlists[0].id);
    await expect(getBootstrap(randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it("makes list creation and per-member saves idempotent, independent and private", async () => {
    const input = { requestId: randomUUID(), name: "Shared", isShared: true };
    const lists = await Promise.all([
      createWishlist(alice.userId, input),
      createWishlist(alice.userId, input),
    ]);
    const id = lists[0].data.id;
    expect(lists.map((entry) => entry.created).sort()).toEqual([false, true]);
    expect(lists[1].data.id).toBe(id);
    await expect(getWishlist(bob.userId, id)).rejects.toMatchObject({ status: 404 });
    await addWishlistMember(alice.userId, id, "bob");
    await expect(addWishlistMember(bob.userId, id, "eve")).rejects.toMatchObject({ status: 403 });
    await expect(removeWishlistMember(alice.userId, id, alice.userId)).rejects.toMatchObject({
      status: 400,
    });
    await Promise.all([
      putWishlistItem(alice.userId, id, { placeId, saved: true, completed: true }),
      putWishlistItem(bob.userId, id, { placeId, saved: true }),
      putWishlistItem(bob.userId, id, { placeId, saved: true }),
    ]);
    expect((await getWishlist(alice.userId, id)).entries[0]).toMatchObject({
      saverIds: expect.arrayContaining([alice.userId, bob.userId]),
      completedBy: [alice.userId],
    });
    expect(await getWishlistOverlap(bob.userId, id)).toEqual({ placeIds: [placeId] });
    await putWishlistItem(alice.userId, id, { placeId, saved: false });
    expect((await getWishlist(bob.userId, id)).entries[0].saverIds).toEqual([bob.userId]);
    expect(await getWishlistOverlap(bob.userId, id)).toEqual({ placeIds: [] });
    await removeWishlistMember(alice.userId, id, bob.userId);
    await expect(putWishlistItem(bob.userId, id, { placeId, saved: true })).rejects.toMatchObject({
      status: 404,
    });
    expect((await getWishlist(alice.userId, id)).entries).toEqual([]);
    expect(await getWishlists(bob.userId)).toEqual([]);
    await expect(addWishlistMember(alice.userId, id, "unknown")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("requires owned visits and consistent categories, sentiments, ties and comparisons for rankings", async () => {
    await createEdition(alice, capture());
    await createEdition(alice, capture({ placeId: secondPlace }));
    await createEdition(alice, capture({ placeId: placeIds[34] }));
    await expect(
      putRanking(bob.userId, placeId, { sentiment: "recommend", ranking: "unranked" }),
    ).rejects.toMatchObject({ status: 400 });
    await putRanking(alice.userId, placeId, { sentiment: "recommend", ranking: "unranked" });
    const group: RankingGroupDto = {
      category: "nature",
      sentiment: "recommend",
      placeIds: [placeId, secondPlace],
      provisionalIds: [],
      ties: [[placeId, secondPlace]],
    };
    const tied = await putRanking(alice.userId, secondPlace, {
      sentiment: "recommend",
      ranking: "settled",
      comparedTo: placeId,
      tiedWith: placeId,
      group,
    });
    expect(tied.rankings.map((entry) => entry.rankScore)).toEqual([2, 2]);
    await expect(
      putRanking(alice.userId, secondPlace, {
        sentiment: "depends",
        ranking: "settled",
        group: { ...group, sentiment: "depends" },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      putRanking(alice.userId, secondPlace, {
        sentiment: "recommend",
        ranking: "settled",
        group: { ...group, placeIds: [secondPlace, placeIds[34]], ties: [] },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      putRanking(alice.userId, secondPlace, {
        sentiment: "recommend",
        ranking: "settled",
        tiedWith: placeId,
        group: { ...group, ties: [] },
      }),
    ).rejects.toMatchObject({ status: 400 });
    const moved = await putRanking(alice.userId, placeId, {
      sentiment: "skip",
      ranking: "settled",
    });
    expect(moved.rankings.find((entry) => entry.placeId === placeId)).toMatchObject({
      sentiment: "skip",
      ranking: "unranked",
      rankScore: null,
    });
    expect(moved.rankings.find((entry) => entry.placeId === secondPlace)).toMatchObject({
      comparedTo: null,
      tiedWith: null,
      rankScore: 1,
    });
    expect(moved.rankingGroups[0].placeIds).toEqual([secondPlace]);
  });

  it("removes last-visit ranking state while retaining independent preferences and saves", async () => {
    const first = await createEdition(alice, capture());
    const revisit = await createEdition(alice, capture());
    const list = await createWishlist(alice.userId, { requestId: randomUUID(), name: "Saved" });
    await putWishlistItem(alice.userId, list.data.id, { placeId, saved: true });
    await putPlacePreference(alice.userId, placeId, { favorite: true, tip: "Private tip" });
    await putRanking(alice.userId, placeId, { sentiment: "depends", ranking: "unranked" });
    await deleteEdition(alice, first.data.id);
    expect((await getRankings(alice.userId)).rankings).toHaveLength(1);
    await deleteEdition(alice, revisit.data.id);
    expect((await getRankings(alice.userId)).rankings).toEqual([]);
    expect((await getWishlist(alice.userId, list.data.id)).entries).toHaveLength(1);
    expect(await getPlacePreferences(alice.userId)).toEqual([
      { placeId, favorite: true, tip: "Private tip" },
    ]);
    expect(await getPlacePreferences(bob.userId)).toEqual([]);
    await putPlacePreference(alice.userId, placeId, { tip: "" });
    expect(await getPlacePreferences(alice.userId)).toEqual([{ placeId, favorite: true, tip: "" }]);
  });

  it("persists plans with parent/member atomicity, creator-only edits, completion and retained create tombstones", async () => {
    const list = await createWishlist(alice.userId, {
      requestId: randomUUID(),
      name: "Shared",
      isShared: true,
    });
    await addWishlistMember(alice.userId, list.data.id, "bob");
    const input = {
      requestId: randomUUID(),
      wishlistId: list.data.id,
      plan: plan([alice.userId, bob.userId]),
    };
    const creations = await Promise.all([
      createPlan(alice.userId, input),
      createPlan(alice.userId, input),
    ]);
    const saved = creations[0].data;
    expect(new Set(creations.map((entry) => entry.data.id)).size).toBe(1);
    expect(await db.select().from(outingMembers)).toHaveLength(2);
    expect((await getPlans(bob.userId))[0].id).toBe(saved.id);
    expect(await getPlans(eve.userId)).toEqual([]);
    await expect(
      updatePlan(bob.userId, saved.id, plan([alice.userId, bob.userId])),
    ).rejects.toMatchObject({ status: 403 });
    await expect(deletePlan(eve.userId, saved.id)).rejects.toMatchObject({ status: 404 });
    expect(
      (await updatePlan(alice.userId, saved.id, { ...input.plan, title: "Revised" })).plan.title,
    ).toBe("Revised");
    await expect(
      createEdition(alice, capture({ placeId: secondPlace, outingId: saved.id })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(createEdition(eve, capture({ outingId: saved.id }))).rejects.toMatchObject({
      status: 404,
    });
    const visit = await createEdition(alice, capture({ outingId: saved.id }));
    expect((await getPlans(alice.userId))[0].status).toBe("completed");
    await removeWishlistMember(alice.userId, list.data.id, bob.userId);
    expect(await getPlans(bob.userId)).toEqual([]);
    await expect(createEdition(bob, capture({ outingId: saved.id }))).rejects.toMatchObject({
      status: 404,
    });
    await deletePlan(alice.userId, saved.id);
    expect((await getEdition(alice, visit.data.id)).outingId).toBeNull();
    await expect(createPlan(alice.userId, input)).rejects.toMatchObject({ status: 410 });
  });

  it("rejects nonmembers, unknown catalog IDs, invalid totals and time windows without partial plans", async () => {
    const input = { requestId: randomUUID(), plan: plan([alice.userId, bob.userId]) };
    await expect(createPlan(alice.userId, input)).rejects.toMatchObject({ status: 400 });
    await expect(
      createPlan(alice.userId, { ...input, plan: { ...plan(), totalCostCents: 1000 } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createPlan(alice.userId, { ...input, plan: { ...plan(), totalMinutes: 1 } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createPlan(alice.userId, {
        ...input,
        plan: { ...plan(), stops: [{ ...plan().stops[0], placeId: randomUUID() }] },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createPlan(alice.userId, {
        ...input,
        plan: { ...plan(), stops: [{ ...plan().stops[0], arrivalMinute: 601 }] },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await db.select().from(apiRequests)).toHaveLength(0);
    expect(await db.select().from(outings)).toHaveLength(0);
    expect(await db.select().from(outingMembers)).toHaveLength(0);
    expect((await createPlan(alice.userId, { ...input, plan: plan() })).created).toBe(true);
  });
});

describe("route compatibility and guarded wire responses", () => {
  it("returns envelopes, 201/200 retries, strict IDs/bodies and no-store owner-only responses", async () => {
    const input = capture();
    expect((await postEdition(request("/editions", "POST", input, null))).status).toBe(401);
    const saved = await postEdition(request("/editions", "POST", input));
    expect(saved.status).toBe(201);
    expect(saved.headers.get("Cache-Control")).toBe("private, no-store");
    const { data } = await saved.json();
    expect(data.userId).toBe(alice.userId);
    expect((await postEdition(request("/editions", "POST", input))).status).toBe(200);
    expect(
      (await postEdition(request("/editions", "POST", { ...input, ownerId: bob.userId }))).status,
    ).toBe(400);
    expect(
      (await patchEdition(request("/editions/bad", "PATCH", { note: "No" }), idParams("bad")))
        .status,
    ).toBe(400);
    const denied = await readEdition(
      request(`/editions/${data.id}`, "GET", undefined, bob),
      idParams(data.id),
    );
    expect(denied.status).toBe(404);
    expect(await denied.json()).toMatchObject({ error: "not_found" });
    expect(
      (await readEdition(request(`/editions/${data.id}?userId=${bob.userId}`), idParams(data.id)))
        .status,
    ).toBe(400);
    expect(
      (await removeEdition(request(`/editions/${data.id}`, "DELETE"), idParams(data.id))).status,
    ).toBe(200);
    expect((await postEdition(request("/editions", "POST", input))).status).toBe(410);
  });

  it("validates malformed, oversized and private bodies without exposing provider failures", async () => {
    const invalidJson = new Request("https://souvenir.test/api/editions", {
      method: "POST",
      body: "{",
      headers: { "x-test-user": alice.userId },
    });
    expect(await (await postEdition(invalidJson)).json()).toMatchObject({ error: "invalid_json" });
    expect(
      (
        await postEdition(
          request("/editions", "POST", { ...capture(), note: "x".repeat(1024 * 1024) }),
        )
      ).status,
    ).toBe(413);
    expect(
      (await postEdition(request("/editions", "POST", capture({ timezone: "Not/AZone" })))).status,
    ).toBe(400);
    expect(
      (await postEdition(request("/editions", "POST", capture({ placeId: randomUUID() })))).status,
    ).toBe(400);
    expect(await db.select().from(apiRequests)).toHaveLength(0);
    expect((await bootstrap(request("/bootstrap?userId=foreign"))).status).toBe(400);
  });

  it("preserves public catalog and search shapes while explicitly labeling private simulations", async () => {
    const catalogResponse = await catalog(request("/places", "GET", undefined, null));
    expect((await catalogResponse.json()).data).toHaveLength(35);
    expect((await catalog(request("/places?q=a&q=b"))).status).toBe(400);
    expect((await catalog(request("/places?userId=arbitrary"))).status).toBe(400);
    expect((await catalog(request("/places?q=%25"))).status).toBe(200);
    const detail = await readPlace(request("/places/test-place-0"), {
      params: Promise.resolve({ slug: "test-place-0" }),
    });
    expect((await detail.json()).data).toMatchObject({ id: placeId, slug: "test-place-0" });
    const results = await search(request("/search", "POST", { q: "Place", limit: 10 }, null));
    expect((await results.json()).data[0]).toMatchObject({
      place: { id: expect.any(String) },
      distanceKm: null,
      score: 1,
    });
    expect(
      (
        await identify(
          request(
            "/capture/identify",
            "POST",
            { imageUrl: "https://untrusted.test/picture.jpg" },
            null,
          ),
        )
      ).status,
    ).toBe(401);
    const suggestions = await identify(
      request("/capture/identify", "POST", { imageUrl: "https://untrusted.test/picture.jpg" }),
    );
    expect((await suggestions.json()).data.provenance).toBe("simulation");
    const preview = await previewPlan(
      request("/plan", "POST", { query: "Place", placeIds: [placeId] }),
    );
    expect((await preview.json()).data).toMatchObject({
      provenance: "simulation",
      title: expect.any(String),
      places: expect.any(Array),
    });
    expect((await importDropbox(request("/import/dropbox", "POST", {}))).status).toBe(503);
    expect(await db.select().from(editions)).toHaveLength(0);
    const list = await createWishlist(alice.userId, {
      requestId: randomUUID(),
      name: "Legacy save",
    });
    const saved = await legacySave(
      request(`/wishlists/${list.data.id}/items`, "POST", { placeId }),
      idParams(list.data.id),
    );
    expect((await saved.json()).data.entries[0].placeId).toBe(placeId);
    expect(
      await db
        .select()
        .from(apiRequests)
        .where(
          and(eq(apiRequests.userId, alice.userId), eq(apiRequests.operation, "wishlist.create")),
        ),
    ).toHaveLength(1);
  });
});
