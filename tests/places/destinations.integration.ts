import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Client } from "@elastic/elasticsearch";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "@/lib/db";
import {
  places,
  placeSources,
  placeImages,
  users,
  coverageCells,
  friendships,
} from "@/lib/db/schema";
import {
  ingestProviderPlaces,
  getDocumentedAvailability,
  getPlaceSources,
} from "@/lib/places/store";
import { findDuplicateCandidates } from "@/lib/places/dedupe";
import { nearbyPg, searchPg } from "@/lib/search/pgFallback";
import { ElasticSearchService } from "@/lib/search/es";
import { fixtureCities } from "@/lib/places/fixtures";
import { acquireCoverageLease, fillCoverageCell, getNearbyPlaces } from "@/lib/places/coverage";
import { geohash } from "@/lib/places/geo";
import { providerPlaceSchema, type ProviderPlace, type PlacesProvider } from "@/lib/places/types";
import { enrichPlace, purgeExpiredSourceData } from "@/lib/places/enrich";
import { getPlaceConditions } from "@/lib/places/conditions";
import { GET as nearbyRoute } from "@/app/api/places/nearby/route";
import { GET as searchRoute } from "@/app/api/places/search/route";
import { GET as conditionsRoute } from "@/app/api/places/[slug]/conditions/route";
import { POST as legacySearchRoute } from "@/app/api/search/route";
import type { AuthContext } from "../../shared/api-contract";

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: async (request: Request) => {
    const userId = request.headers.get("x-test-user");
    return userId
      ? { auth: { userId, mode: "bearer", email: null } }
      : { response: Response.json({ error: { code: "unauthorized" } }, { status: 401 }) };
  },
}));
const owner: AuthContext = { userId: randomUUID(), mode: "bearer", email: null };
const friend: AuthContext = { userId: randomUUID(), mode: "bearer", email: null };
const outsider: AuthContext = { userId: randomUUID(), mode: "bearer", email: null };
let sequence = 900000;
const record = (overrides: Partial<ProviderPlace> = {}) =>
  providerPlaceSchema.parse({
    provider: "osm",
    providerId: `node/${++sequence}`,
    lat: 0,
    lng: 0,
    category: "culture",
    name: `Provider ${randomUUID()}`,
    fetchedAt: new Date().toISOString(),
    evidence: "provider",
    ...overrides,
  });
async function ingest(input: ProviderPlace) {
  const result = await ingestProviderPlaces([input]);
  expect(result.inserted).toBe(1);
  return result.placeIds[0];
}
function request(path: string, authenticated = true) {
  return new Request(`http://localhost/api${path}`, {
    headers: authenticated ? { "x-test-user": owner.userId } : {},
  });
}
beforeAll(async () => {
  await db.insert(users).values(
    [owner, friend, outsider].map(({ userId }) => ({
      id: userId,
      handle: `test-${userId}`,
      displayName: "Synthetic test user",
    })),
  );
});
afterAll(closeDb);
describe("disposable destination catalog", () => {
  it("queries all eight seeded cities with honest fixture source metadata", async () => {
    for (const city of fixtureCities) {
      const results = await nearbyPg({ lat: city.lat, lng: city.lng, radiusM: 5000, limit: 20 });
      expect(results).toHaveLength(20);
      expect(
        results.every((result) => result.distanceM <= 5000 && result.place.city === city.city),
      ).toBe(true);
      expect(results[0].place.sources?.[0]).toMatchObject({
        provider: "curated",
        status: "unavailable",
        license: "Authored synthetic test fixture",
      });
      expect(results[0].place.sources?.[0]).not.toHaveProperty("payload");
      expect(await getDocumentedAvailability(results[0].place.id)).toMatchObject({
        status: "unknown",
        openingHours: null,
      });
      const citySearch = await searchPg({ q: city.city, radiusKm: 25, limit: 20 });
      expect(citySearch).toHaveLength(20);
    }
    expect(
      (await searchPg({ q: "PT", radiusKm: 25, limit: 5 })).every(
        ({ place }) => place.country === "PT",
      ),
    ).toBe(true);
  });
  it("is idempotent by stable identity; ambiguity and near-name matches need review", async () => {
    const original = record({ name: "Museum Alpha Test", lat: 10, lng: 10 });
    const id = await ingest(original);
    const rerun = await ingestProviderPlaces([{ ...original, name: "Renamed museum" }]);
    expect(rerun).toMatchObject({ inserted: 0, refreshed: 1, placeIds: [id] });
    expect(
      await findDuplicateCandidates({
        ...original,
        name: "Unrelated",
        externalIds: { osm: original.providerId },
      }),
    ).toMatchObject([{ reason: "external_identity", place: { id } }]);
    const near = record({ name: "Museum Álpha Test", lat: 10.00001, lng: 10 });
    expect(await ingestProviderPlaces([near])).toMatchObject({ inserted: 0, needsReview: 1 });
    const second = record({
      name: "Independent Site Bravo",
      lat: 11,
      lng: 11,
      wikidataId: "Q900001",
    });
    await ingest(second);
    expect(await ingestProviderPlaces([{ ...original, wikidataId: "Q900001" }])).toMatchObject({
      inserted: 0,
      needsReview: 1,
    });
    const concurrent = record({ lat: 12, lng: 12 });
    const results = await Promise.all([
      ingestProviderPlaces([concurrent]),
      ingestProviderPlaces([concurrent]),
    ]);
    expect(results.reduce((total, result) => total + result.inserted, 0)).toBe(1);
    expect(new Set(results.flatMap((result) => result.placeIds)).size).toBe(1);
  });
  it("orders exact radius results across the dateline and filters category/country", async () => {
    const near = await ingest(record({ lat: 0, lng: -179.99, country: "FJ", category: "nature" }));
    await ingest(record({ lat: 0, lng: 179.95, country: "FJ", category: "nature" }));
    await ingest(record({ lat: 0, lng: -179.99, country: "US", category: "nature" }));
    await ingest(record({ lat: 0, lng: -179.99, country: "FJ", category: "culture" }));
    const query = {
      lat: 0,
      lng: 179.99,
      radiusM: 5000,
      country: "FJ",
      category: "nature" as const,
      limit: 20,
    };
    const results = await nearbyPg(query);
    expect(results.map((result) => result.place.id)).toEqual([near, expect.any(String)]);
    expect(results[0].distanceM).toBeCloseTo(2223.9, -1);
    expect(results[0].distanceM).toBeLessThan(results[1].distanceM);
    expect(await nearbyPg({ ...query, radiusM: 1000 })).toEqual([]);
  });
  it("hides private and unverified custom places from discovery and dedupe", async () => {
    const unverified = await ingest(record({ lat: 20, lng: 20, name: "Public custom hidden" }));
    const hidden = await ingest(record({ lat: 20, lng: 20, name: "Private hidden" }));
    const verified = await ingest(record({ lat: 20, lng: 20, name: "Verified discoverable" }));
    await db
      .update(places)
      .set({ source: "user", ownerId: owner.userId, stats: { verified: false } })
      .where(eq(places.id, unverified));
    await db.update(places).set({ visibility: "private" }).where(eq(places.id, hidden));
    await db
      .update(places)
      .set({ source: "user", ownerId: owner.userId, stats: { verified: true } })
      .where(eq(places.id, verified));
    expect(
      (await nearbyPg({ lat: 20, lng: 20, radiusM: 1000, limit: 20 })).map((item) => item.place.id),
    ).toEqual([verified]);
    expect(await searchPg({ q: "hidden", lat: 20, lng: 20, radiusKm: 1, limit: 20 })).toEqual([]);
    const [row] = await db.select().from(places).where(eq(places.id, unverified));
    expect(
      await findDuplicateCandidates({ ...row, externalIds: row.externalIds ?? undefined }),
    ).toEqual([]);
    expect(
      await findDuplicateCandidates(
        { ...row, externalIds: row.externalIds ?? undefined },
        db,
        owner,
      ),
    ).toMatchObject([{ place: { id: unverified } }]);
    const [hiddenSource] = await db
      .select()
      .from(placeSources)
      .where(eq(placeSources.placeId, hidden));
    expect(
      await ingestProviderPlaces([
        record({ providerId: hiddenSource.providerId, name: "Renamed private identity" }),
      ]),
    ).toMatchObject({ inserted: 0, needsReview: 1 });
  });
  it("returns known, unknown or stale hours without raw payloads and enforces condition visibility", async () => {
    const id = await ingest(
      record({ openingHours: "Mo-Fr 09:00-17:00", timezone: "Europe/Lisbon" }),
    );
    expect(await getDocumentedAvailability(id)).toMatchObject({
      status: "known",
      openingHours: "Mo-Fr 09:00-17:00",
      timezone: "Europe/Lisbon",
    });
    await db
      .update(placeSources)
      .set({ fetchedAt: new Date(Date.now() - 91 * 86400000) })
      .where(eq(placeSources.placeId, id));
    expect(await getDocumentedAvailability(id)).toMatchObject({
      status: "stale",
      openingHours: null,
      timezone: null,
    });
    expect((await getPlaceSources(id))[0]).not.toHaveProperty("payload");
    const [place] = await db
      .update(places)
      .set({ visibility: "friends", ownerId: owner.userId, source: "user" })
      .where(eq(places.id, id))
      .returning();
    await expect(getPlaceConditions(outsider, place.slug)).rejects.toMatchObject({ status: 404 });
    await db
      .insert(friendships)
      .values({ userId: owner.userId, friendId: friend.userId, status: "accepted" });
    expect(await getPlaceConditions(friend, place.slug)).toMatchObject({
      openNow: null,
      availability: { status: "stale" },
    });
    await db.delete(friendships).where(eq(friendships.userId, owner.userId));
    await expect(getPlaceConditions(friend, place.slug)).rejects.toMatchObject({ status: 404 });
  });
  it("uses global and cell leases, refreshes once and rejects stale worker tokens", async () => {
    await db.delete(coverageCells);
    const providerRecord = record({ lat: 40, lng: 40 });
    const provider: PlacesProvider = {
      name: "osm",
      bbox: vi.fn(async () => [providerRecord]),
      nearby: async () => [],
    };
    const cell = geohash(40, 40, 5);
    expect(await fillCoverageCell(cell, provider)).toBe("ready");
    expect(await fillCoverageCell(cell, provider)).toBe("ready");
    expect(provider.bbox).toHaveBeenCalledTimes(1);
    expect(await acquireCoverageLease(geohash(41, 41, 5), "osm")).toBeNull();
    await db.delete(coverageCells);
    const tokens = await Promise.all([
      acquireCoverageLease(cell, "osm"),
      acquireCoverageLease(cell, "osm"),
    ]);
    expect(tokens.filter(Boolean)).toHaveLength(1);
    await db.delete(coverageCells);
    const newCell = geohash(42, 42, 5);
    const stale: PlacesProvider = {
      name: "osm",
      nearby: async () => [],
      bbox: async () => {
        await db
          .update(coverageCells)
          .set({ leaseToken: randomUUID() })
          .where(eq(coverageCells.geohash, newCell));
        return [record({ lat: 42, lng: 42 })];
      },
    };
    expect(await fillCoverageCell(newCell, stale)).toBe("pending");
    expect(await nearbyPg({ lat: 42, lng: 42, radiusM: 1000, limit: 10 })).toEqual([]);
    await db.delete(coverageCells);
    const failed: PlacesProvider = {
      name: "osm",
      nearby: async () => [],
      bbox: vi.fn(async () => {
        throw new Error("provider outage");
      }),
    };
    expect(await fillCoverageCell(cell, failed)).toBe("unavailable");
    expect(await fillCoverageCell(cell, failed)).toBe("unavailable");
    expect(failed.bbox).toHaveBeenCalledTimes(1);
    expect(
      await getNearbyPlaces({ lat: 42, lng: 42, radiusM: 1000, limit: 10 }, db, {
        lazyFill: false,
        provider: failed,
      }),
    ).toMatchObject({ coverage: "unavailable", places: [] });
  });
  it("enriches by exact identity, requires explicit image selection and purges expired image metadata", async () => {
    const id = await ingest(record({ wikidataId: "Q900010", lat: 45, lng: 45 }));
    const image = {
      thumburl: "https://upload.wikimedia.org/example.jpg",
      thumbwidth: 1280,
      thumbheight: 720,
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
      mime: "image/jpeg",
      extmetadata: {
        Artist: { value: "Fixture artist" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
      },
    };
    const http = {
      json: async (url: string) =>
        url.includes("wikidata.org")
          ? {
              entities: {
                Q900010: {
                  id: "Q900010",
                  descriptions: { en: { value: "Provider description" } },
                  claims: {
                    P18: [{ mainsnak: { snaktype: "value", datavalue: { value: "Example.jpg" } } }],
                  },
                },
              },
            }
          : { query: { pages: [{ title: "File:Example.jpg", imageinfo: [image] }] } },
    };
    expect(await enrichPlace(id, {}, db, http)).toMatchObject({
      updated: true,
      imageSelected: false,
      candidates: [{ providerId: "File:Example.jpg" }],
    });
    expect(await db.select().from(placeImages).where(eq(placeImages.placeId, id))).toEqual([]);
    await expect(
      enrichPlace(id, { confirmedImage: "File:Unrelated.jpg" }, db, http),
    ).rejects.toThrow("Confirmed image");
    expect(await enrichPlace(id, { confirmedImage: "File:Example.jpg" }, db, http)).toMatchObject({
      imageSelected: true,
    });
    await enrichPlace(id, { confirmedImage: "File:Example.jpg" }, db, http);
    expect(await db.select().from(placeImages).where(eq(placeImages.placeId, id))).toHaveLength(1);
    await db
      .update(placeSources)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(placeSources.placeId, id), eq(placeSources.provider, "wikimedia")));
    expect(await purgeExpiredSourceData()).toBe(1);
    expect(await purgeExpiredSourceData()).toBe(0);
    expect(await db.select().from(placeImages).where(eq(placeImages.placeId, id))).toEqual([]);
    expect((await db.select().from(places).where(eq(places.id, id)))[0].heroImageUrl).toBeNull();
  });
  it("checks route auth and query bounds, preserving data/error envelopes", async () => {
    expect((await nearbyRoute(request("/places/nearby?lat=0&lng=0", false))).status).toBe(401);
    expect((await nearbyRoute(request("/places/nearby?lat=0&lng=0&radiusM=50001"))).status).toBe(
      400,
    );
    expect((await nearbyRoute(request("/places/nearby?lat=0&lng=0&userId=bad"))).status).toBe(400);
    expect((await nearbyRoute(request("/places/nearby?lat=0&lat=1&lng=0"))).status).toBe(400);
    const response = await nearbyRoute(request("/places/nearby?lat=34.05&lng=-118.25&limit=2"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.places).toHaveLength(2);
    expect((await searchRoute(request("/places/search?q=Paris&limit=2"))).status).toBe(200);
    expect((await searchRoute(request("/places/search?lat=&lng=1"))).status).toBe(400);
    expect((await searchRoute(request("/places/search?q=Paris", false))).status).toBe(401);
    expect((await searchRoute(request("/places/search?lat=91&lng=0"))).status).toBe(400);
    expect(
      (
        await legacySearchRoute(
          new Request("http://localhost/api/search", {
            method: "POST",
            body: JSON.stringify({ q: "Paris" }),
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await conditionsRoute(request("/places/unknown/conditions", false), {
          params: Promise.resolve({ slug: "unknown" }),
        })
      ).status,
    ).toBe(401);
  });
  it("uses ES geo filters but rechecks current visibility in PostgreSQL and falls back on outage", async () => {
    const visible = await ingest(record({ lat: 50, lng: 50 }));
    const hidden = await ingest(record({ lat: 50, lng: 50 }));
    await db.update(places).set({ visibility: "private" }).where(eq(places.id, hidden));
    const bodies: string[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        bodies.push(body);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "x-elastic-product": "Elasticsearch",
        });
        res.end(JSON.stringify({ hits: { hits: [{ _id: visible }, { _id: hidden }] } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test listener.");
    const client = new Client({ node: `http://127.0.0.1:${address.port}`, maxRetries: 0 });
    try {
      const service = new ElasticSearchService(client);
      expect(
        (await service.nearby({ lat: 50, lng: 50, radiusM: 1000, limit: 10 })).map(
          (item) => item.place.id,
        ),
      ).toEqual([visible]);
      expect(bodies[0]).toContain('"geo_distance"');
      expect(
        (await service.search({ q: "", lat: 50, lng: 50, radiusKm: 1, limit: 10 })).map(
          (item) => item.place.id,
        ),
      ).toEqual([visible]);
      vi.spyOn(client, "search").mockRejectedValue(new Error("ES unavailable"));
      expect(
        (await service.nearby({ lat: 50, lng: 50, radiusM: 1000, limit: 10 })).map(
          (item) => item.place.id,
        ),
      ).toEqual([visible]);
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it("preserves database grants and row-security boundaries", async () => {
    const rows = await db.execute<{ name: string; enabled: boolean }>(
      sql`select relname as name, relrowsecurity as enabled from pg_class where relname in ('place_sources', 'coverage_cells', 'place_images')`,
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.enabled)).toBe(true);
  });
});
