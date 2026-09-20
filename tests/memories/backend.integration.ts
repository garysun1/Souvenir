import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, closeDb } from "@/lib/db";
import {
  editions,
  friendships,
  importItems,
  memoryMoments,
  places,
  tasteEvidence,
  tasteProfiles,
  tripAlbums,
  tripAlbumMembers,
  users,
  wishlistSaves,
  wishlists,
} from "@/lib/db/schema";
import {
  analyzeImport,
  commitImport,
  completeImportItem,
  createImportBatch,
  deleteImport,
  getImportBatch,
  getImportPhoto,
  patchImportItem,
  registerImportItem,
} from "@/lib/server/memory-imports";
import { analyzeTaste, deleteTaste, getTaste, patchTaste, publishTaste } from "@/lib/server/taste";
import { getSharedTaste, getTasteComparison } from "@/lib/server/taste-comparison";
import { UNKNOWN_METADATA } from "@/lib/server/memory-import-media";
import type { AuthContext } from "../../shared/api-contract";
import type {
  MemoryAnalysis,
  TasteAnalysisResult,
  TasteSourceRef,
} from "../../shared/memories-contract";
import type { TasteSourceContent } from "@/lib/ai/taste";

const mocks = vi.hoisted(() => ({
  bytes: new Map<string, Buffer>(),
  sign: vi.fn(),
  remove: vi.fn(),
  image: vi.fn(),
  analyze: vi.fn(),
}));
vi.mock("@/lib/auth/storage", () => ({
  createCaptureUpload: async (auth: AuthContext, input: { requestId: string }) => ({
    bucket: "captures",
    path: `${auth.userId}/${input.requestId}.png`,
    signedUrl: "https://synthetic.invalid/upload",
    token: "synthetic",
    uploaded: false,
  }),
  signCapturePhoto: mocks.sign,
  deleteCapturePhoto: mocks.remove,
}));
vi.mock("@/lib/server/memory-import-media", async (original) => ({
  ...(await original<typeof import("@/lib/server/memory-import-media")>()),
  downloadImportBytes: async (_auth: AuthContext, path: string) => {
    const bytes = mocks.bytes.get(path);
    if (!bytes) throw new Error("Synthetic image was not uploaded.");
    return bytes;
  },
}));
vi.mock("@/lib/ai/taste", async (original) => ({
  ...(await original<typeof import("@/lib/ai/taste")>()),
  tasteProvider: { image: mocks.image, analyze: mocks.analyze },
}));

const people = [randomUUID(), randomUUID(), randomUUID()];
const auth = (index = 0): AuthContext => ({ userId: people[index], email: null, mode: "bearer" });
const placeIds = [randomUUID(), randomUUID(), randomUUID()];
const imageResult: MemoryAnalysis = {
  version: 1,
  interests: ["gardens"],
  scene: "Synthetic garden",
  confidence: 0.8,
};
const resultFor = (sources: TasteSourceContent[]): TasteAnalysisResult => ({
  title: "Gardens and art",
  observations: sources.map((source, index) => ({
    source: source.source,
    interest: index % 2 ? "art" : "gardens",
    intent: source.intent,
    confidence: 0.8,
    explanation: "Selected synthetic place facts.",
  })),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function upload(owner = auth(), batchId?: string, suppliedBytes?: Buffer) {
  const batch = batchId
    ? await getImportBatch(owner, batchId)
    : await createImportBatch(owner, { requestId: randomUUID(), title: "Synthetic memories" });
  const bytes =
    suppliedBytes ??
    (await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: `#${randomUUID().replaceAll("-", "").slice(0, 6)}`,
      },
    })
      .png()
      .toBuffer());
  const input = {
    requestId: randomUUID(),
    fileName: "synthetic.png",
    contentType: "image/png" as const,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    metadata: UNKNOWN_METADATA,
  };
  const registration = await registerImportItem(owner, batch.id, input);
  if (!registration.upload) throw new Error("Unexpected duplicate synthetic fixture.");
  mocks.bytes.set(registration.upload.path, bytes);
  const item = await completeImportItem(owner, batch.id, registration.item.id, {
    expectedVersion: registration.item.version,
  });
  return {
    batch: await getImportBatch(owner, batch.id),
    item,
    input,
    bytes,
    path: registration.upload.path,
  };
}
async function savedSources(owner = auth()): Promise<TasteSourceRef[]> {
  const [list] = await db
    .insert(wishlists)
    .values({ ownerId: owner.userId, name: "Synthetic" })
    .returning();
  await db.insert(wishlistSaves).values(
    placeIds.slice(0, 2).map((placeId) => ({
      wishlistId: list.id,
      placeId,
      userId: owner.userId,
    })),
  );
  return placeIds.slice(0, 2).map((id) => ({ kind: "saved_place", id }));
}
async function publish(owner = auth()) {
  const profile = await getTaste(owner);
  return publishTaste(owner, {
    expectedVersion: profile.version,
    sharing: "friends",
    confirmShare: true,
    title: "Explicit shared title",
    collageMomentIds: [],
    facets: [
      { interest: "gardens", intent: "want_to_try", strength: 2 },
      { interest: "art", intent: "want_to_try", strength: 1 },
    ],
  });
}
async function friends() {
  await db
    .insert(friendships)
    .values({ userId: people[0], friendId: people[1], status: "accepted" });
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, places CASCADE`);
  await db.insert(users).values(
    people.map((id, index) => ({
      id,
      handle: `fixture${index}`,
      displayName: `Fixture ${index}`,
    })),
  );
  await db.insert(places).values(
    placeIds.map((id, index) => ({
      id,
      slug: `fixture-${index}`,
      name: index ? "Art gallery" : "Botanical garden",
      description: "Synthetic garden art museum",
      category: "culture" as const,
      lat: 34,
      lng: -118,
      city: "Los Angeles",
      country: "US",
      visibility: index === 2 ? ("private" as const) : ("public" as const),
      ownerId: index === 2 ? people[2] : null,
      rarityTier: "common" as const,
      rarityAppeal: 1,
      rarityDiscoveryFreq: 1,
      rarityAvailability: 1,
    })),
  );
  vi.resetAllMocks();
  mocks.bytes.clear();
  mocks.sign.mockImplementation(async (_auth: AuthContext, path: string) => ({
    path,
    url: `https://synthetic.invalid/read/${randomUUID()}`,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  }));
  mocks.remove.mockResolvedValue(undefined);
  mocks.image.mockResolvedValue(imageResult);
  mocks.analyze.mockImplementation(async (sources: TasteSourceContent[]) => resultFor(sources));
});
afterAll(closeDb);

describe("private import persistence", () => {
  it("serializes concurrent replay, rejects payload changes, and scopes identical hashes to each account", async () => {
    const a = await upload();
    const replay = await Promise.all([
      registerImportItem(auth(), a.batch.id, a.input),
      registerImportItem(auth(), a.batch.id, a.input),
    ]);
    expect(replay.map((x) => x.item.id)).toEqual([a.item.id, a.item.id]);
    await expect(
      registerImportItem(auth(), a.batch.id, { ...a.input, fileName: "changed.png" }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    const b = await createImportBatch(auth(), { requestId: randomUUID(), title: "Another" });
    const duplicate = await registerImportItem(auth(), b.id, {
      ...a.input,
      requestId: randomUUID(),
    });
    expect(duplicate).toMatchObject({
      upload: null,
      item: { state: "duplicate", duplicateOfItemId: a.item.id },
    });
    const other = await upload(auth(1), undefined, a.bytes);
    expect(other.item.state).toBe("uploaded");
    expect(other.item.duplicateOfItemId).toBeNull();
    await expect(getImportBatch(auth(1), a.batch.id)).rejects.toMatchObject({ status: 404 });
    await expect(getImportPhoto(auth(1), a.batch.id, a.item.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      patchImportItem(auth(1), a.batch.id, a.item.id, {
        expectedVersion: a.item.version,
        groupKey: "stolen",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      deleteImport(auth(1), a.batch.id, null, { expectedVersion: a.batch.version }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("bounds concurrent registrations at twenty items", async () => {
    const batch = await createImportBatch(auth(), { requestId: randomUUID(), title: "Bounded" });
    const responses = await Promise.allSettled(
      Array.from({ length: 22 }, (_, i) =>
        registerImportItem(auth(), batch.id, {
          requestId: randomUUID(),
          fileName: "synthetic.png",
          contentType: "image/png",
          sizeBytes: 100,
          sha256: createHash("sha256").update(String(i)).digest("hex"),
          metadata: UNKNOWN_METADATA,
        }),
      ),
    );
    expect(responses.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    expect((await getImportBatch(auth(), batch.id)).items).toHaveLength(20);
  });

  it("keeps missing EXIF unknown and re-signs owned media instead of caching expired URLs", async () => {
    const { batch, item } = await upload();
    expect(item.metadata).toEqual(UNKNOWN_METADATA);
    const first = await getImportPhoto(auth(), batch.id, item.id);
    const second = await getImportPhoto(auth(), batch.id, item.id);
    expect(first.url).not.toBe(second.url);
    expect(first).not.toHaveProperty("path");
    expect(mocks.sign).toHaveBeenCalledTimes(2);
    expect(
      await completeImportItem(auth(), batch.id, item.id, { expectedVersion: 1 }),
    ).toMatchObject({ id: item.id });
  });

  it("persists partial provider failure, retries only failed work, and replays without a second provider call", async () => {
    const a = await upload();
    const b = await upload(auth(), a.batch.id);
    mocks.image
      .mockRejectedValueOnce(new Error("provider timeout"))
      .mockResolvedValueOnce(imageResult);
    const input = {
      requestId: randomUUID(),
      expectedVersion: b.batch.version,
      itemIds: [a.item.id, b.item.id],
      consentImages: true as const,
    };
    const response = await analyzeImport(auth(), b.batch.id, input);
    expect(response.items.map((i) => i.state).sort()).toEqual(["failed", "ready"]);
    expect(response.items.find((i) => i.state === "failed")?.error?.message).not.toContain(
      "timeout",
    );
    const retry = await analyzeImport(auth(), b.batch.id, input);
    expect(retry.items.every((i) => i.state === "ready")).toBe(true);
    expect(mocks.image).toHaveBeenCalledTimes(3);
    await analyzeImport(auth(), b.batch.id, input);
    expect(mocks.image).toHaveBeenCalledTimes(3);
  });

  it("does not overwrite edits or resurrect a deleted item after analysis", async () => {
    const a = await upload();
    const work = deferred<MemoryAnalysis>();
    const started = deferred<void>();
    mocks.image.mockImplementation(async () => {
      started.resolve();
      return work.promise;
    });
    const analysis = analyzeImport(auth(), a.batch.id, {
      requestId: randomUUID(),
      expectedVersion: a.batch.version,
      itemIds: [a.item.id],
      consentImages: true,
    });
    await started.promise;
    const processing = await getImportBatch(auth(), a.batch.id);
    const edited = await patchImportItem(auth(), a.batch.id, a.item.id, {
      expectedVersion: processing.items[0].version,
      groupKey: "manual",
    });
    work.resolve(imageResult);
    await analysis;
    expect((await getImportBatch(auth(), a.batch.id)).items[0]).toMatchObject({
      groupKey: "manual",
      analysis: null,
    });
    await deleteImport(auth(), a.batch.id, a.item.id, { expectedVersion: edited.version });
    expect((await getImportBatch(auth(), a.batch.id)).items).toEqual([]);
  });

  it("deduplicates concurrent analysis submissions with persisted leases", async () => {
    const a = await upload();
    const work = deferred<MemoryAnalysis>();
    const started = deferred<void>();
    mocks.image.mockImplementation(async () => {
      started.resolve();
      return work.promise;
    });
    const input = {
      requestId: randomUUID(),
      expectedVersion: a.batch.version,
      itemIds: [a.item.id],
      consentImages: true as const,
    };
    const first = analyzeImport(auth(), a.batch.id, input);
    await started.promise;
    expect((await analyzeImport(auth(), a.batch.id, input)).items[0].state).toBe("processing");
    work.resolve(imageResult);
    expect((await first).items[0].state).toBe("ready");
    expect(mocks.image).toHaveBeenCalledTimes(1);
  });

  it("bounds provider retries and permits manual review after exhaustion", async () => {
    const a = await upload();
    mocks.image.mockRejectedValue(new Error("Rate limit"));
    const input = {
      requestId: randomUUID(),
      expectedVersion: a.batch.version,
      itemIds: [a.item.id],
      consentImages: true as const,
    };
    for (let attempt = 0; attempt < 4; attempt++) await analyzeImport(auth(), a.batch.id, input);
    expect(mocks.image).toHaveBeenCalledTimes(3);
    const failed = (await getImportBatch(auth(), a.batch.id)).items[0];
    expect(failed.error?.retryable).toBe(false);
    const reviewed = await patchImportItem(auth(), a.batch.id, a.item.id, {
      expectedVersion: failed.version,
      groupKey: "reviewed",
    });
    expect(reviewed.state).toBe("uploaded");
    expect(reviewed.error).toBeNull();
  });

  it("clears abandoned final leases and never resurrects a deleted batch", async () => {
    const a = await upload();
    await db
      .update(importItems)
      .set({
        state: "processing",
        attempts: 3,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(0),
      })
      .where(eq(importItems.id, a.item.id));
    const expired = await analyzeImport(auth(), a.batch.id, {
      requestId: randomUUID(),
      expectedVersion: a.batch.version,
      itemIds: [a.item.id],
      consentImages: true,
    });
    expect(expired.items[0]).toMatchObject({ state: "failed", error: { retryable: false } });
    const b = await upload();
    const work = deferred<MemoryAnalysis>();
    const started = deferred<void>();
    mocks.image.mockImplementation(async () => {
      started.resolve();
      return work.promise;
    });
    const running = analyzeImport(auth(), b.batch.id, {
      requestId: randomUUID(),
      expectedVersion: b.batch.version,
      itemIds: [b.item.id],
      consentImages: true,
    });
    await started.promise;
    const processing = await getImportBatch(auth(), b.batch.id);
    await deleteImport(auth(), b.batch.id, null, { expectedVersion: processing.version });
    const failure = expect(running).rejects.toMatchObject({ status: 404 });
    work.resolve(imageResult);
    await failure;
    expect(await db.select().from(importItems).where(eq(importItems.id, b.item.id))).toEqual([]);
  });

  it("requires historical confirmation, creates one independent owner visit, and revokes moments on import deletion", async () => {
    const a = await upload();
    const input = {
      requestId: randomUUID(),
      expectedVersion: a.batch.version,
      target: { kind: "private" as const },
      items: [{ itemId: a.item.id, createVisit: true, note: "Private note" }],
    };
    await expect(commitImport(auth(), a.batch.id, input)).rejects.toMatchObject({ status: 400 });
    await patchImportItem(auth(), a.batch.id, a.item.id, {
      expectedVersion: a.item.version,
      confirmedStop: {
        placeId: placeIds[0],
        capturedAt: "2025-12-31T23:00:00Z",
        timezone: "America/Los_Angeles",
      },
    });
    const current = await getImportBatch(auth(), a.batch.id);
    const commit = { ...input, expectedVersion: current.version };
    const result = await commitImport(auth(), a.batch.id, commit);
    expect(result.editionIds).toHaveLength(1);
    expect(result.moments).toHaveLength(1);
    expect((await commitImport(auth(), a.batch.id, commit)).editionIds).toEqual(result.editionIds);
    const [edition] = await db.select().from(editions).where(eq(editions.id, result.editionIds[0]));
    expect(edition).toMatchObject({ userId: people[0], visibility: "private", visitSequence: 1 });
    await deleteImport(auth(), a.batch.id, null, { expectedVersion: result.batch.version });
    expect(await db.select().from(memoryMoments)).toEqual([]);
    expect(await db.select().from(editions)).toHaveLength(1);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects pending album membership and commits attribution after explicit acceptance", async () => {
    const a = await upload(auth(1));
    const [album] = await db
      .insert(tripAlbums)
      .values({ ownerId: people[0], requestId: randomUUID(), title: "Shared trip" })
      .returning();
    const [membership] = await db
      .insert(tripAlbumMembers)
      .values({
        albumId: album.id,
        userId: people[1],
        invitedBy: people[0],
        requestId: randomUUID(),
      })
      .returning();
    const input = {
      requestId: randomUUID(),
      expectedVersion: a.batch.version,
      target: { kind: "album" as const, albumId: album.id, confirmShare: true as const },
      items: [{ itemId: a.item.id, createVisit: false, note: null }],
    };
    await expect(commitImport(auth(1), a.batch.id, input)).rejects.toMatchObject({ status: 404 });
    await db
      .update(tripAlbumMembers)
      .set({ state: "accepted" })
      .where(eq(tripAlbumMembers.id, membership.id));
    expect((await commitImport(auth(1), a.batch.id, input)).moments[0]).toMatchObject({
      authorId: people[1],
      albumId: album.id,
    });
    expect(await db.select().from(editions)).toEqual([]);
  });
});

describe("taste leases, privacy and removal", () => {
  it("checks source ownership before inference and preserves manual preferences through regeneration", async () => {
    const sources = await savedSources();
    const initial = await getTaste(auth());
    await expect(
      analyzeTaste(auth(1), {
        requestId: randomUUID(),
        expectedVersion: 1,
        sources,
        consentImages: false,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.analyze).not.toHaveBeenCalled();
    const edited = await patchTaste(auth(), {
      expectedVersion: initial.version,
      titleOverride: "Manual title",
      overrides: [
        { interest: "gardens", intent: "want_to_try", action: "dismiss", strength: 1 },
        { interest: "hiking", intent: "enjoyed", action: "prefer", strength: 3 },
      ],
      preferences: { pace: "relaxed", budget: "free", accessibility: "User supplied" },
    });
    const generated = await analyzeTaste(auth(), {
      requestId: randomUUID(),
      expectedVersion: edited.version,
      sources,
      consentImages: false,
    });
    expect(generated.draft?.title).toBe("Manual title");
    expect(generated.draft?.facets.map((f) => f.interest)).toEqual(["hiking", "art"]);
    expect(generated.preferences).toEqual(edited.preferences);
    expect(generated.overrides).toEqual(edited.overrides);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("requires import image consent and rejects forged provider source IDs", async () => {
    const a = await upload();
    const sources: TasteSourceRef[] = [{ kind: "import_item", id: a.item.id }];
    const initial = await getTaste(auth());
    await expect(
      analyzeTaste(auth(), {
        requestId: randomUUID(),
        expectedVersion: initial.version,
        sources,
        consentImages: false,
      }),
    ).rejects.toMatchObject({ status: 400 });
    mocks.analyze.mockResolvedValue({
      title: null,
      observations: [
        {
          source: { kind: "import_item", id: randomUUID() },
          interest: "gardens",
          intent: "enjoyed",
          confidence: 1,
          explanation: "Forged",
        },
      ],
    });
    await expect(
      analyzeTaste(auth(), {
        requestId: randomUUID(),
        expectedVersion: initial.version,
        sources,
        consentImages: true,
      }),
    ).rejects.toMatchObject({
      code: "service_unavailable",
      message: "The provider returned an unusable result.",
    });
    expect(await db.select().from(tasteEvidence)).toEqual([]);
  });

  it("does not let concurrent replay call the provider twice, or a late result overwrite edits", async () => {
    const sources = await savedSources();
    const initial = await getTaste(auth());
    const work = deferred<TasteAnalysisResult>();
    const started = deferred<TasteSourceContent[]>();
    mocks.analyze.mockImplementation(async (selected: TasteSourceContent[]) => {
      started.resolve(selected);
      return work.promise;
    });
    const input = {
      requestId: randomUUID(),
      expectedVersion: initial.version,
      sources,
      consentImages: false,
    };
    const first = analyzeTaste(auth(), input);
    const selected = await started.promise;
    const processing = await analyzeTaste(auth(), input);
    expect(processing.analysisState).toBe("processing");
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    await patchTaste(auth(), {
      expectedVersion: processing.version,
      titleOverride: "New edit",
      excludedSources: [sources[0]],
    });
    const failure = expect(first).rejects.toMatchObject({ status: 409 });
    work.resolve(resultFor(selected));
    await failure;
    const final = await getTaste(auth());
    expect(final.titleOverride).toBe("New edit");
    expect(final.evidence).toEqual([]);
  });

  it("does not resurrect a profile deleted during inference", async () => {
    const sources = await savedSources();
    const initial = await getTaste(auth());
    const work = deferred<TasteAnalysisResult>();
    const started = deferred<TasteSourceContent[]>();
    mocks.analyze.mockImplementation(async (selected: TasteSourceContent[]) => {
      started.resolve(selected);
      return work.promise;
    });
    const first = analyzeTaste(auth(), {
      requestId: randomUUID(),
      expectedVersion: initial.version,
      sources,
      consentImages: false,
    });
    const selected = await started.promise;
    const processing = await getTaste(auth());
    await deleteTaste(auth(), { expectedVersion: processing.version });
    const failure = expect(first).rejects.toMatchObject({ status: 404 });
    work.resolve(resultFor(selected));
    await failure;
    expect(await db.select().from(tasteProfiles)).toEqual([]);
    expect(await db.select().from(tasteEvidence)).toEqual([]);
  });

  it("invalidates removed saved inputs before any new friend read", async () => {
    await friends();
    const sources = await savedSources();
    const initial = await getTaste(auth());
    await analyzeTaste(auth(), {
      requestId: randomUUID(),
      expectedVersion: initial.version,
      sources,
      consentImages: false,
    });
    await publish();
    await publish(auth(1));
    expect((await getTasteComparison(auth(1), people[0], {})).overlap).toBe("strong");
    await db
      .delete(wishlistSaves)
      .where(and(eq(wishlistSaves.userId, people[0]), eq(wishlistSaves.placeId, placeIds[0])));
    await expect(getSharedTaste(auth(1), people[0])).rejects.toMatchObject({ status: 404 });
    const current = await getTaste(auth());
    expect(current.sharing).toBe("private");
    expect(current.published).toBeNull();
    expect(current.evidence).toHaveLength(1);
  });

  it("invalidates import-derived evidence and publication while preserving overrides on source deletion", async () => {
    const a = await upload();
    const initial = await getTaste(auth());
    const generated = await analyzeTaste(auth(), {
      requestId: randomUUID(),
      expectedVersion: initial.version,
      sources: [{ kind: "import_item", id: a.item.id }],
      consentImages: true,
    });
    await patchTaste(auth(), {
      expectedVersion: generated.version,
      overrides: [{ interest: "art", intent: "enjoyed", action: "prefer", strength: 2 }],
    });
    await publish();
    await deleteImport(auth(), a.batch.id, a.item.id, { expectedVersion: a.item.version });
    const current = await getTaste(auth());
    expect(current.evidence).toEqual([]);
    expect(current.selectedSources).toEqual([]);
    expect(current.published).toBeNull();
    expect(current.draft?.facets[0].interest).toBe("art");
  });

  it("rejects a result from an expired lease without publishing it", async () => {
    const sources = await savedSources();
    const initial = await getTaste(auth());
    const work = deferred<TasteAnalysisResult>();
    const started = deferred<TasteSourceContent[]>();
    mocks.analyze.mockImplementation(async (selected: TasteSourceContent[]) => {
      started.resolve(selected);
      return work.promise;
    });
    const first = analyzeTaste(auth(), {
      requestId: randomUUID(),
      expectedVersion: initial.version,
      sources,
      consentImages: false,
    });
    const selected = await started.promise;
    await db
      .update(tasteProfiles)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(tasteProfiles.userId, people[0]));
    const failure = expect(first).rejects.toMatchObject({ status: 409 });
    work.resolve(resultFor(selected));
    await failure;
    expect(await db.select().from(tasteEvidence)).toEqual([]);
  });
});

describe("approved facets and friendship visibility", () => {
  it("requires both published profiles, exposes only the publication DTO, and filters inaccessible suggestions", async () => {
    await friends();
    await publish();
    await expect(getTasteComparison(auth(), people[1], {})).rejects.toMatchObject({ status: 404 });
    await publish(auth(1));
    const shared = await getSharedTaste(auth(1), people[0]);
    expect(Object.keys(shared).sort()).toEqual(["published", "userId", "version"]);
    expect(Object.keys(shared.published).sort()).toEqual([
      "collageMomentIds",
      "facets",
      "publishedAt",
      "title",
    ]);
    const first = await getTasteComparison(auth(), people[1], {
      city: "Los Angeles",
      country: "US",
    });
    const second = await getTasteComparison(auth(1), people[0], {
      city: "Los Angeles",
      country: "US",
    });
    expect(first).toEqual(second);
    expect(first.overlap).toBe("strong");
    expect(first.suggestions.length).toBeLessThanOrEqual(2);
    expect(first.suggestions.some((s) => s.place.id === placeIds[2])).toBe(false);
    await expect(getSharedTaste(auth(2), people[0])).rejects.toMatchObject({ status: 404 });
    await db.delete(friendships);
    await expect(getSharedTaste(auth(1), people[0])).rejects.toMatchObject({ status: 404 });
    await expect(getTasteComparison(auth(), people[1], {})).rejects.toMatchObject({ status: 404 });
  });

  it("revokes sharing immediately when the owner publishes privately", async () => {
    await friends();
    const profile = await publish();
    await publish(auth(1));
    await publishTaste(auth(), {
      expectedVersion: profile.version,
      sharing: "private",
      confirmShare: false,
      title: null,
      facets: [],
      collageMomentIds: [],
    });
    await expect(getSharedTaste(auth(1), people[0])).rejects.toMatchObject({ status: 404 });
    await expect(getTasteComparison(auth(1), people[0], {})).rejects.toMatchObject({ status: 404 });
  });
});
