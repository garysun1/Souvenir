import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  albumMemberInviteSchema,
  confirmedMemoryStopSchema,
  importAnalyzeSchema,
  importBatchCreateSchema,
  importCommitSchema,
  importItemCreateSchema,
  importItemPatchSchema,
  importMetadataSchema,
  invitationRespondSchema,
  memoryAnalysisSchema,
  memoryMomentCreateSchema,
  memoryPageQuerySchema,
  momentTagCreateSchema,
  tasteAnalysisResultSchema,
  tasteAnalyzeSchema,
  tasteComparisonQuerySchema,
  tasteProfilePatchSchema,
  tastePublishSchema,
  tripAlbumCreateSchema,
} from "@/lib/contracts/memories";
import {
  importBatches,
  importItems,
  memoryMoments,
  momentPersonTags,
  tasteEvidence,
  tasteProfiles,
  tripAlbumMembers,
  tripAlbums,
} from "@/lib/db/schema";
import type {
  ImportCommitRequest,
  ImportItemCreate,
  MemoryMomentCreate,
  TasteAnalysisResult,
  TasteProfilePatch,
  TastePublishRequest,
} from "../../shared/memories-contract";
import { MEMORY_LIMITS, MEMORIES_API } from "../../shared/memories-contract";
import journal from "../../drizzle/meta/_journal.json";

const id = "10000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const metadata = {
  capturedAt: null,
  timezone: null,
  latitude: null,
  longitude: null,
  accuracyM: null,
  origin: "unknown" as const,
};
const image = {
  requestId: id,
  sha256: "a".repeat(64),
  fileName: "museum.jpg",
  contentType: "image/jpeg" as const,
  sizeBytes: 1024,
  metadata,
};
const stop = { placeId: id, capturedAt: "2026-09-20T08:00:00-04:00", timezone: "America/New_York" };
const facet = { interest: "gardens" as const, intent: "enjoyed" as const, strength: 2 as const };

describe("memory upload and confirmation boundaries", () => {
  it("preserves unknown metadata without inventing a visit", () => {
    expect(importItemCreateSchema.parse(image).metadata).toEqual(metadata);
    expect(importItemPatchSchema.parse({ expectedVersion: 1, confirmedStop: null })).toEqual({
      expectedVersion: 1,
      confirmedStop: null,
    });
    expect(confirmedMemoryStopSchema.parse(stop)).toEqual(stop);
    for (const value of [
      { ...stop, capturedAt: null },
      { ...stop, timezone: "Mars/Olympus" },
      { ...stop, placeId: "unresolved" },
      { ...stop, capturedAt: "2026-09-20T08:00:00" },
    ])
      expect(confirmedMemoryStopSchema.safeParse(value).success).toBe(false);
  });
  it("rejects unsupported images, sizes, hashes, paths and ownership injection", () => {
    for (const fields of [
      { contentType: "image/heic" },
      { sizeBytes: MEMORY_LIMITS.imageBytes + 1 },
      { sizeBytes: 0 },
      { sha256: "x".repeat(64) },
      { fileName: "../x.jpg" },
      { fileName: "a\u0000.jpg" },
      { ownerId: other },
      { photoPath: `${other}/x.jpg` },
      { analysis: { interests: ["gardens"] } },
    ])
      expect(importItemCreateSchema.safeParse({ ...image, ...fields }).success).toBe(false);
    expect(
      importItemCreateSchema.safeParse({ ...image, sizeBytes: MEMORY_LIMITS.imageBytes }).success,
    ).toBe(true);
  });
  it("validates metadata coordinates separately from user confirmation", () => {
    for (const fields of [
      { latitude: 45 },
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: -181 },
      { accuracyM: 10 },
      { capturedAt: "not-a-date" },
      { timezone: "invalid" },
    ])
      expect(importMetadataSchema.safeParse({ ...metadata, ...fields }).success).toBe(false);
    expect(importMetadataSchema.safeParse({ ...metadata, latitude: 0, longitude: 0 }).success).toBe(
      true,
    );
  });
  it("bounds analysis and requires explicit image consent", () => {
    const input = { requestId: id, expectedVersion: 1, itemIds: [id], consentImages: true };
    expect(importAnalyzeSchema.safeParse(input).success).toBe(true);
    for (const fields of [
      { consentImages: false },
      { itemIds: [] },
      { itemIds: [id, id] },
      { expectedVersion: 0 },
      {
        itemIds: Array.from(
          { length: 6 },
          (_, i) => `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        ),
      },
    ])
      expect(importAnalyzeSchema.safeParse({ ...input, ...fields }).success).toBe(false);
    expect(
      memoryAnalysisSchema.safeParse({
        version: 1,
        interests: ["gardens"],
        confidence: 0.3,
        scene: null,
      }).success,
    ).toBe(true);
    expect(
      memoryAnalysisSchema.safeParse({
        version: 1,
        interests: ["happy", "ethnicity"],
        confidence: 1,
        scene: null,
      }).success,
    ).toBe(false);
  });
  it("separates private saving, album sharing, and confirmed visit conversion", () => {
    const input = {
      requestId: id,
      expectedVersion: 1,
      target: { kind: "private" },
      items: [{ itemId: id, createVisit: false, note: null }],
    };
    expect(importCommitSchema.safeParse(input).success).toBe(true);
    expect(
      importCommitSchema.safeParse({ ...input, target: { kind: "album", albumId: other } }).success,
    ).toBe(false);
    expect(
      importCommitSchema.safeParse({
        ...input,
        target: { kind: "album", albumId: other, confirmShare: true },
      }).success,
    ).toBe(true);
    expect(
      importCommitSchema.safeParse({ ...input, items: [...input.items, ...input.items] }).success,
    ).toBe(false);
    expect(
      importCommitSchema.safeParse({ ...input, items: [{ itemId: id, note: null }] }).success,
    ).toBe(false);
    expect(
      tripAlbumCreateSchema.safeParse({ requestId: id, title: "Past trip", sourceBatchId: other })
        .success,
    ).toBe(true);
  });
});

describe("taste consent and disclosure boundaries", () => {
  it("separates consented images from text-only edition facts", () => {
    const input = {
      requestId: id,
      expectedVersion: 1,
      sources: [{ kind: "edition", id }],
      consentImages: false,
    };
    expect(tasteAnalyzeSchema.safeParse(input).success).toBe(true);
    expect(
      tasteAnalyzeSchema.safeParse({ ...input, sources: [{ kind: "import_item", id }] }).success,
    ).toBe(false);
    expect(
      tasteAnalyzeSchema.safeParse({
        ...input,
        sources: [{ kind: "import_item", id }],
        consentImages: true,
      }).success,
    ).toBe(true);
    expect(
      tasteAnalyzeSchema.safeParse({ ...input, sources: [...input.sources, ...input.sources] })
        .success,
    ).toBe(false);
  });
  it("rejects uncontrolled or malformed model claims without trusting source authorization", () => {
    const output = {
      title: null,
      observations: [
        {
          source: { kind: "edition", id },
          interest: facet.interest,
          intent: facet.intent,
          confidence: 0.5,
          explanation: "A selected garden visit",
        },
      ],
    };
    const observation = output.observations[0];
    expect(
      tasteAnalysisResultSchema.safeParse({ ...output, observations: [observation] }).success,
    ).toBe(true);
    for (const fields of [
      { interest: "personality" },
      { source: { kind: "face", id } },
      { source: { kind: "edition", id: "invented" } },
      { confidence: 1.1 },
      { emotions: ["happy"] },
    ])
      expect(
        tasteAnalysisResultSchema.safeParse({
          ...output,
          observations: [{ ...observation, ...fields }],
        }).success,
      ).toBe(false);
  });
  it("allows explicit preferences and whole-field override replacements, not model writes", () => {
    const patch = {
      expectedVersion: 2,
      overrides: [{ ...facet, action: "dismiss" }],
      excludedSources: [{ kind: "edition", id }],
      titleOverride: null,
    };
    expect(tasteProfilePatchSchema.safeParse(patch).success).toBe(true);
    for (const fields of [{ draft: {} }, { published: {} }, { userId: other }, { evidence: [] }]) {
      expect(tasteProfilePatchSchema.safeParse({ ...patch, ...fields }).success).toBe(false);
    }
    expect(tasteProfilePatchSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(tasteProfilePatchSchema.safeParse({ expectedVersion: 1, overrides: [] }).success).toBe(
      true,
    );
  });
  it("publishes approved facets without private evidence and separately selected collage", () => {
    const input = {
      expectedVersion: 1,
      sharing: "friends",
      title: "Garden explorer",
      facets: [facet],
      collageMomentIds: [],
      confirmShare: true,
    };
    expect(tastePublishSchema.safeParse(input).success).toBe(true);
    for (const fields of [
      { confirmShare: false },
      { facets: [{ ...facet, evidenceIds: [id] }] },
      { facets: [facet, facet] },
      { collageMomentIds: [id, id] },
      { preferences: { pace: "busy" } },
    ])
      expect(tastePublishSchema.safeParse({ ...input, ...fields }).success).toBe(false);
    expect(
      tastePublishSchema.safeParse({ ...input, sharing: "private", confirmShare: false }).success,
    ).toBe(true);
    expect(tasteComparisonQuerySchema.safeParse({ city: "Paris" }).success).toBe(false);
    expect(tasteComparisonQuerySchema.safeParse({ city: "Paris", country: "FR" }).success).toBe(
      true,
    );
  });
});

describe("independent moment and membership contracts", () => {
  it("requires one owned media selector and explicit recipient consent", () => {
    const moment = { requestId: id, source: { kind: "edition", id }, target: { kind: "private" } };
    expect(memoryMomentCreateSchema.safeParse(moment).success).toBe(true);
    expect(memoryMomentCreateSchema.safeParse({ ...moment, authorId: other }).success).toBe(false);
    expect(
      memoryMomentCreateSchema.safeParse({ ...moment, source: { photoPath: "private.jpg" } })
        .success,
    ).toBe(false);
    expect(
      momentTagCreateSchema.safeParse({ requestId: id, userId: other, confirmShare: true }).success,
    ).toBe(true);
    expect(momentTagCreateSchema.safeParse({ requestId: id, userId: other }).success).toBe(false);
    expect(albumMemberInviteSchema.safeParse({ requestId: id, userId: other }).success).toBe(true);
    expect(
      invitationRespondSchema.safeParse({
        expectedVersion: 1,
        state: "accepted",
        albumRole: "owner",
      }).success,
    ).toBe(false);
    expect(
      invitationRespondSchema.safeParse({ expectedVersion: 1, state: "pending" }).success,
    ).toBe(false);
  });
  it("has dedicated signing paths and strict pagination", () => {
    expect(MEMORIES_API.momentPhoto).toBe("/api/moments/:momentId/photo");
    expect(MEMORIES_API.importItemPhoto).toBe("/api/imports/:batchId/items/:itemId/photo");
    expect(memoryPageQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(memoryPageQuerySchema.parse({ limit: "50", cursor: id })).toEqual({
      limit: 50,
      cursor: id,
    });
    for (const query of [{ limit: "51" }, { limit: "" }, { cursor: "bad" }, { ownerId: other }]) {
      expect(memoryPageQuerySchema.safeParse(query).success).toBe(false);
    }
    expect(importBatchCreateSchema.safeParse({ requestId: id, title: " " }).success).toBe(false);
  });
  it("keeps DTOs equal to validated request outputs", () => {
    expectTypeOf<z.infer<typeof importItemCreateSchema>>().toEqualTypeOf<ImportItemCreate>();
    expectTypeOf<z.infer<typeof importCommitSchema>>().toEqualTypeOf<ImportCommitRequest>();
    expectTypeOf<z.infer<typeof memoryMomentCreateSchema>>().toEqualTypeOf<MemoryMomentCreate>();
    expectTypeOf<z.infer<typeof tasteProfilePatchSchema>>().toEqualTypeOf<TasteProfilePatch>();
    expectTypeOf<z.infer<typeof tastePublishSchema>>().toEqualTypeOf<TastePublishRequest>();
    expectTypeOf<z.infer<typeof tasteAnalysisResultSchema>>().toEqualTypeOf<TasteAnalysisResult>();
  });
});

describe("additive database contract", () => {
  const tables = [
    importBatches,
    importItems,
    tasteProfiles,
    tasteEvidence,
    tripAlbums,
    tripAlbumMembers,
    memoryMoments,
    momentPersonTags,
  ];
  it("denies direct client access and provides revision timestamps on every table", () => {
    for (const table of tables) {
      const config = getTableConfig(table);
      expect(config.enableRLS).toBe(true);
      expect(config.policies).toHaveLength(0);
      expect(config.columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["version", "created_at", "updated_at"]),
      );
    }
  });
  it("binds each moment source and tag sender to the owner in foreign keys", () => {
    const references = getTableConfig(memoryMoments).foreignKeys.map((key) => key.reference());
    expect(references.map((ref) => ref.columns.map((column) => column.name))).toEqual(
      expect.arrayContaining([
        ["source_edition_id", "author_id", "place_id"],
        ["source_import_item_id", "author_id"],
      ]),
    );
    expect(
      getTableConfig(momentPersonTags).foreignKeys.map((key) =>
        key.reference().columns.map((column) => column.name),
      ),
    ).toContainEqual(["moment_id", "sender_id"]);
  });
  it("generates an additive migration with RLS and no dependency on later unique constraints", () => {
    const migration = journal.entries.find((entry) => entry.idx === 9);
    expect(migration).toBeDefined();
    const sql = readFileSync(
      new URL(`../../drizzle/${migration!.tag}.sql`, import.meta.url),
      "utf8",
    );
    expect(sql).not.toMatch(
      /DROP\s|DISABLE ROW LEVEL SECURITY|CREATE POLICY|ALTER TABLE "editions"/,
    );
    for (const table of tables) {
      const name = getTableConfig(table).name;
      expect(sql).toContain(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY`);
    }
    expect(sql).toContain('REFERENCES "public"."editions"("id","user_id","place_id")');
  });
});
