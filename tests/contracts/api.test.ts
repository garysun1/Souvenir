import { describe, expect, it } from "vitest";
import {
  editionCreateSchema,
  editionPatchSchema,
  photoUploadSchema,
  rankingPutSchema,
  wishlistItemPutSchema,
} from "@/lib/contracts/api";

const requestId = "10000000-0000-4000-8000-000000000001";
const placeId = "20000000-0000-4000-8000-000000000001";
const visit = {
  requestId,
  placeId,
  capturedAt: "2026-09-19T14:00:00-07:00",
  timezone: "America/Los_Angeles",
};

describe("cross-client persistence inputs", () => {
  it("accepts explicit instants and rejects ambiguous local timestamps and timezones", () => {
    expect(editionCreateSchema.parse(visit)).toEqual(visit);
    expect(
      editionCreateSchema.safeParse({ ...visit, capturedAt: "2026-09-19T14:00:00" }).success,
    ).toBe(false);
    expect(editionCreateSchema.safeParse({ ...visit, timezone: "Los Angeles" }).success).toBe(
      false,
    );
  });

  it("rejects caller ownership, fixture identifiers, remote photos and unknown fields", () => {
    for (const extra of [
      { userId: placeId },
      { ownerId: placeId },
      { placeId: "la-the-broad" },
      { requestId: "capture-123" },
      { photoUrl: "https://example.com/photo.jpg" },
      { photoPath: `../${requestId}.jpg` },
      { origin: "seed" },
    ]) {
      expect(editionCreateSchema.safeParse({ ...visit, ...extra }).success).toBe(false);
    }
  });

  it("requires durable import identity only for real import requests", () => {
    expect(editionCreateSchema.safeParse({ ...visit, origin: "import" }).success).toBe(false);
    expect(
      editionCreateSchema.safeParse({ ...visit, importSourceId: "provider:file:1" }).success,
    ).toBe(false);
    expect(
      editionCreateSchema.parse({ ...visit, origin: "import", importSourceId: "provider:file:1" })
        .origin,
    ).toBe("import");
  });

  it("allows clearing metadata but cannot move an edition between users or places", () => {
    expect(editionPatchSchema.parse({ note: null, companions: [] })).toEqual({
      note: null,
      companions: [],
    });
    expect(editionPatchSchema.safeParse({}).success).toBe(false);
    expect(editionPatchSchema.safeParse({ placeId }).success).toBe(false);
    expect(editionPatchSchema.safeParse({ note: "x".repeat(2001) }).success).toBe(false);
  });

  it("limits media and uses explicit idempotent save values", () => {
    expect(
      photoUploadSchema.safeParse({ requestId, contentType: "image/svg+xml", size: 10 }).success,
    ).toBe(false);
    expect(
      photoUploadSchema.safeParse({
        requestId,
        contentType: "image/jpeg",
        size: 10 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
    expect(wishlistItemPutSchema.safeParse({ placeId }).success).toBe(false);
    expect(wishlistItemPutSchema.parse({ placeId, saved: false }).saved).toBe(false);
  });

  it("rejects malformed ranking buckets without discarding the middle sentiment", () => {
    expect(rankingPutSchema.parse({ sentiment: "depends", ranking: "unranked" }).sentiment).toBe(
      "depends",
    );
    const group = {
      category: "culture",
      sentiment: "recommend",
      placeIds: [placeId],
      provisionalIds: [],
      ties: [],
    };
    for (const change of [
      { placeIds: [placeId, placeId] },
      { provisionalIds: [requestId] },
      { ties: [[placeId, placeId]] },
      { ties: [[placeId, requestId]] },
      { sentiment: "skip" },
    ]) {
      expect(
        rankingPutSchema.safeParse({
          sentiment: "recommend",
          ranking: "settled",
          group: { ...group, ...change },
        }).success,
      ).toBe(false);
    }
  });
});
