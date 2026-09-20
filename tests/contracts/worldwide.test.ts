import { describe, expect, it } from "vitest";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  feedQuerySchema,
  leaderboardQuerySchema,
  nearbyQuerySchema,
  placeCreateSchema,
  placeImagePromoteSchema,
  placeListQuerySchema,
  placeMetricsSchema,
  placeNoteCreateSchema,
  placeSuggestionSchema,
  placeTagPutSchema,
  userIdParamsSchema,
} from "@/lib/contracts/api";
import { serializePlaceSourceDto, serializeSocialEditionDto } from "@/lib/contracts/serializers";
import { placeSources, editions } from "@/lib/db/schema";
import type { PlaceMetricsDto } from "../../shared/api-contract";
import { isPublicSupabaseKey } from "../../shared/public-supabase-config";
import { validateConfig } from "../../apps/mobile/src/lib/env";

const id = "10000000-0000-4000-8000-000000000001";
const otherId = "20000000-0000-4000-8000-000000000001";
const base = { requestId: id, name: "Remote trail", category: "nature", lat: 70, lng: 170 };
const metric = (): PlaceMetricsDto => ({
  provenance: "souvenir-activity",
  definitionVersion: 1,
  computedAt: "2026-09-20T00:00:00Z",
  sampleStatus: "ready",
  collectors: 6,
  editions: 8,
  saves: 3,
  discoveryFreq: 0.5,
  frequency: {
    status: "ready",
    visitors90d: 5,
    cityVisitors90d: 10,
    city: "Springfield",
    country: "US",
    minimumCohort: 5,
    windowStart: "2026-06-22T00:00:00Z",
    windowEnd: "2026-09-20T00:00:00Z",
  },
  recommendRate: 0.6,
  sentiment: { status: "ready", recommend: 3, depends: 1, skip: 1, minimumSample: 5 },
  trendingScore: 2,
  trend: {
    status: "ready",
    collectors7d: 4,
    weeklyCollectors8w: [2, 2, 2, 2, 2, 2, 2, 2],
    collectors8wAvg: 2,
    baselineStart: "2026-07-13T00:00:00Z",
    baselineEnd: "2026-09-07T00:00:00Z",
  },
});

describe("worldwide request boundary", () => {
  it("allows unknown locality without inventing it and rejects owner spoofing", () => {
    expect(placeCreateSchema.parse(base)).not.toHaveProperty("city");
    expect(placeCreateSchema.parse({ ...base, city: null }).city).toBeNull();
    for (const extra of [
      { userId: id },
      { ownerId: id },
      { source: "osm" },
      { lat: 91 },
      { lng: -181 },
      { country: "USA" },
      { timezone: "Mars/Olympus" },
      { website: "javascript:alert(1)" },
      { website: "not-a-url" },
      { website: "https://password@example.com" },
    ])
      expect(placeCreateSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
  it("requires typed correction values and explicit public image consent", () => {
    for (const correction of [
      { field: "name", value: "New name" },
      { field: "hours", value: { text: "Seasonal", timezone: "UTC" } },
      { field: "website", value: null },
      { field: "coords", value: { lat: 0, lng: 0 } },
      { field: "closed", value: false },
    ])
      expect(placeSuggestionSchema.safeParse({ requestId: id, ...correction }).success).toBe(true);
    for (const correction of [
      { field: "name", value: {} },
      { field: "hours", value: "Monday" },
      { field: "closed", value: "false" },
      { field: "coords", value: { lat: 0, lng: 190 } },
    ])
      expect(placeSuggestionSchema.safeParse({ requestId: id, ...correction }).success).toBe(false);
    const image = {
      requestId: id,
      editionId: otherId,
      confirmPublic: true,
      rightsConfirmed: true,
      license: "CC-BY-4.0",
      attribution: "Photographer",
    };
    expect(placeImagePromoteSchema.safeParse(image).success).toBe(true);
    expect(placeImagePromoteSchema.safeParse({ ...image, confirmPublic: false }).success).toBe(
      false,
    );
    expect(
      placeImagePromoteSchema.safeParse({ ...image, photoPath: "captures/private" }).success,
    ).toBe(false);
  });
  it("bounds notes, tags, UUIDs and URL query inputs", () => {
    expect(
      placeNoteCreateSchema.safeParse({ requestId: id, kind: "tip", body: " ".repeat(10) }).success,
    ).toBe(false);
    expect(
      placeNoteCreateSchema.safeParse({ requestId: id, kind: "tip", body: "x".repeat(601) })
        .success,
    ).toBe(false);
    expect(placeTagPutSchema.safeParse({ tags: ["steep", "steep"] }).success).toBe(false);
    expect(userIdParamsSchema.safeParse({ userId: "@friend" }).success).toBe(false);
    expect(nearbyQuerySchema.parse({ lat: "0", lng: "179.9", radiusM: "500" }).radiusM).toBe(500);
    expect(nearbyQuerySchema.safeParse({ lat: "", lng: "1" }).success).toBe(false);
    expect(nearbyQuerySchema.safeParse({ lat: "0", lng: "0", limit: "51" }).success).toBe(false);
    expect(placeListQuerySchema.safeParse({ city: "Springfield" }).success).toBe(false);
    expect(placeListQuerySchema.safeParse({ south: "1" }).success).toBe(false);
    expect(
      placeListQuerySchema.safeParse({ south: "-1", north: "1", west: "170", east: "-170" })
        .success,
    ).toBe(true);
    expect(leaderboardQuerySchema.safeParse({ scope: "city", city: "Paris" }).success).toBe(false);
    expect(leaderboardQuerySchema.safeParse({ scope: "global", country: "FR" }).success).toBe(
      false,
    );
  });
  it("keeps equal-timestamp pagination deterministic and rejects malformed cursors", () => {
    const value = { createdAt: "2026-09-20T00:00:00Z", id };
    expect(decodeFeedCursor(encodeFeedCursor(value))).toEqual(value);
    for (const cursor of [
      "not-json",
      encodeFeedCursor(value) + "!",
      Buffer.from('{"id":"one"}').toString("base64url"),
    ]) {
      expect(feedQuerySchema.safeParse({ cursor }).success).toBe(false);
    }
  });
});

describe("metric disclosure contracts", () => {
  it("uses city-country cohorts including the numerator and all three sentiments", () => {
    expect(placeMetricsSchema.safeParse(metric()).success).toBe(true);
    const wrong = metric();
    wrong.recommendRate = 0.75;
    expect(placeMetricsSchema.safeParse(wrong).success).toBe(false);
    const tooSmall = metric();
    tooSmall.frequency.visitors90d = 4;
    tooSmall.frequency.cityVisitors90d = 4;
    tooSmall.discoveryFreq = 1;
    expect(placeMetricsSchema.safeParse(tooSmall).success).toBe(false);
    tooSmall.discoveryFreq = null;
    tooSmall.frequency.status = "insufficient";
    expect(placeMetricsSchema.safeParse(tooSmall).success).toBe(true);
    const reversed = metric();
    reversed.frequency.cityVisitors90d = 4;
    expect(placeMetricsSchema.safeParse(reversed).success).toBe(false);
    const remote = metric();
    remote.frequency.city = null;
    expect(placeMetricsSchema.safeParse(remote).success).toBe(false);
  });
  it("uses eight complete weeks and never divides a trend by zero", () => {
    const noBaseline = metric();
    noBaseline.trend.weeklyCollectors8w = Array(8).fill(0);
    noBaseline.trend.collectors8wAvg = 0;
    expect(placeMetricsSchema.safeParse(noBaseline).success).toBe(false);
    noBaseline.trendingScore = null;
    noBaseline.trend.status = "insufficient";
    expect(placeMetricsSchema.safeParse(noBaseline).success).toBe(true);
    const overlapping = metric();
    overlapping.trend.baselineStart = "2026-07-20T00:00:00Z";
    overlapping.trend.baselineEnd = "2026-09-14T00:00:00Z";
    expect(placeMetricsSchema.safeParse(overlapping).success).toBe(false);
  });
});

describe("allowlisted transport serialization", () => {
  it("drops stored provider payload and policy internals", () => {
    const row: typeof placeSources.$inferSelect = {
      id,
      placeId: otherId,
      provider: "osm",
      providerId: "node/1",
      payload: { sensitive: "raw" },
      fetchedAt: new Date(),
      expiresAt: null,
      license: "ODbL-1.0",
      licenseUrl: null,
      attribution: "OpenStreetMap contributors",
      sourceUrl: null,
      retentionPolicy: "licensed",
      retainedFields: ["name"],
      policyUrl: "https://osmfoundation.org",
      policyCheckedAt: new Date(),
      status: "ready",
    };
    const result = serializePlaceSourceDto(row);
    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("retainedFields");
    expect(result.attribution).toBe("OpenStreetMap contributors");
  });
  it("never transports private capture paths, notes or companions in social editions", () => {
    const row: typeof editions.$inferSelect = {
      id,
      userId: otherId,
      placeId: id,
      requestId: id,
      visitSequence: 1,
      variant: "standard",
      photoPath: "captures/private.jpg",
      photoUrl: "https://private.example/image",
      note: "private memory",
      companions: ["Private friend"],
      origin: "capture",
      timezone: "UTC",
      importSourceId: null,
      outingId: null,
      confidence: null,
      visibility: "public",
      capturedAt: new Date("2026-09-20T00:00:00Z"),
      createdAt: new Date(),
    };
    expect(serializeSocialEditionDto(row)).toEqual({
      id,
      userId: otherId,
      placeId: id,
      variant: "standard",
      capturedAt: "2026-09-20T00:00:00.000Z",
    });
  });
});

describe("disposable Supabase public configuration", () => {
  const jwt = (role: string) =>
    [JSON.stringify({ alg: "HS256", typ: "JWT" }), JSON.stringify({ role })]
      .map((value) => Buffer.from(value).toString("base64url"))
      .concat("test-signature")
      .join(".");
  it("allows a local anon JWT but never a service role or hosted JWT", () => {
    const local = "http://127.0.0.1:54321";
    expect(isPublicSupabaseKey(jwt("anon"), local)).toBe(true);
    expect(isPublicSupabaseKey(jwt("service_role"), local)).toBe(false);
    expect(isPublicSupabaseKey("sb_secret_test", local)).toBe(false);
    expect(isPublicSupabaseKey(jwt("anon"), "https://project.supabase.co")).toBe(false);
    expect(isPublicSupabaseKey(jwt("anon"), "http://localhost.attacker.test")).toBe(false);
    expect(
      validateConfig({
        supabaseUrl: local,
        apiUrl: "http://localhost:3000",
        publishableKey: jwt("anon"),
      }).supabaseUrl,
    ).toBe(local);
    expect(() =>
      validateConfig({
        supabaseUrl: local,
        apiUrl: "http://localhost:3000",
        publishableKey: jwt("service_role"),
      }),
    ).toThrow();
  });
});
