import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type {
  EditionCreate,
  EditionDto,
  FeedDto,
  NearbyDto,
  PhotoUploadDto,
  PlaceDetailDto,
  ProfileStatsDto,
} from "../../shared/api-contract";
import { ApiClient, ApiFailure } from "./api";
import { cities, fixtures } from "./fixtures";
import type { Database } from "./local";
import type { Manifest } from "./manifest";
import { profileOracle } from "./oracle";
import { fixtureId, fixtureSlug } from "./run";

type Check = (name: string, action: () => Promise<void>) => Promise<void>;

async function rejects(action: Promise<unknown>, statuses: number[]) {
  await assert.rejects(
    action,
    (error: unknown) => error instanceof ApiFailure && statuses.includes(error.status),
  );
}

export async function edgeChecks(
  manifest: Manifest,
  db: Database,
  clients: Map<number, ApiClient>,
  check: Check,
) {
  const owner = clients.get(0)!;
  const isolated = clients.get(manifest.options.accounts - 1)!;
  const indexes = [fixtures.length, fixtures.length + 1];
  const places = indexes.map((index) => fixtureId(manifest.options.runId, index));
  for (const [offset, index] of indexes.entries()) {
    const key = `place:${index}`;
    if (!manifest.has(key, "place"))
      manifest.append({ kind: "place", key, id: places[offset], index });
    await db`INSERT INTO places (id,slug,name,category,lat,lng,city,country,timezone,description,
      source,visibility,rarity_tier,rarity_appeal,rarity_discovery_freq,rarity_availability)
      VALUES (${places[offset]},${fixtureSlug(manifest.options.runId, index)},'Synthetic edge fixture',
        'nature',0,${offset ? -179.999 : 179.999},
        ${offset ? `Synthetic isolated cohort ${manifest.options.runId}` : null},
        ${offset ? "US" : null},'UTC','Synthetic test coordinate; no destination claim.',
        'placeholder','public','common',0,0,0) ON CONFLICT (id) DO NOTHING`;
  }
  const create = async (
    client: ApiClient,
    placeId: string,
    timezone: string,
    capturedAt: string,
    visibility: "public" | "private",
  ) => {
    const requestId = randomUUID();
    const input: EditionCreate = { requestId, placeId, timezone, capturedAt, visibility };
    manifest.append({ kind: "intent", key: `edge:${requestId}`, id: requestId });
    const edition = await client.call<EditionDto>("POST", "/api/editions", input);
    manifest.append({ kind: "edition", key: `edge:${requestId}`, id: edition.id });
    return { input, edition };
  };
  try {
    await check("zero-friend feed and social counts", async () => {
      const feed = await isolated.call<FeedDto>("GET", "/api/feed?limit=50");
      assert.deepEqual(feed.events, []);
      assert.equal(feed.nextCursor, null);
      const detail = await isolated.call<PlaceDetailDto>(
        "GET",
        `/api/places/${fixtureSlug(manifest.options.runId, 0)}`,
      );
      assert.equal(detail.social.friendsBeen, 0);
      assert.equal(detail.social.friendsSaved, 0);
    });
    await check("antimeridian nearby includes both sides and obeys radius", async () => {
      for (const lng of [179.999, -179.999]) {
        const nearby = await owner.call<NearbyDto>(
          "GET",
          `/api/places/nearby?lat=0&lng=${lng}&radiusM=500&limit=20`,
        );
        assert(places.every((id) => nearby.places.some((entry) => entry.place.id === id)));
        assert(nearby.places.every((entry) => entry.distanceM <= 500));
      }
      await rejects(owner.call("GET", "/api/places/nearby?lat=91&lng=0"), [400]);
    });
    await check("upload MIME/size API validation and real signed Storage rejection", async () => {
      for (const body of [
        { contentType: "text/plain", size: 128 },
        { contentType: "image/jpeg", size: 0 },
        { contentType: "image/jpeg", size: 10 * 1024 * 1024 + 1 },
      ])
        await rejects(
          owner.call("POST", "/api/capture/upload", { requestId: randomUUID(), ...body }),
          [400, 413],
        );
      for (const [bytes, contentType] of [
        [Buffer.from("not an image"), "text/plain"],
        [Buffer.alloc(10 * 1024 * 1024 + 1), "image/jpeg"],
      ] as const) {
        const requestId = randomUUID();
        const path = `${owner.id}/${requestId}.jpg`;
        manifest.append({ kind: "object", key: `edge:${requestId}`, path });
        const upload = await owner.call<PhotoUploadDto>("POST", "/api/capture/upload", {
          requestId,
          contentType: "image/jpeg",
          size: 128,
        });
        assert(upload.token);
        await owner.rejectUpload(path, upload.token, bytes, contentType);
        const [stored] =
          await db`SELECT count(*)::int AS count FROM storage.objects WHERE bucket_id='captures' AND name=${path}`;
        assert.equal(stored.count, 0);
      }
    });
    await check(
      "eight IANA timezones, DST/ISO-week boundaries and concurrent request replay",
      async () => {
        for (const [index, city] of cities.entries()) {
          const capturedAt = [
            "2026-03-08T09:59:00.000Z",
            "2026-03-08T10:01:00.000Z",
            "2025-12-29T00:30:00.000Z",
            "2026-01-04T23:30:00.000Z",
          ][index % 4];
          const { input, edition } = await create(
            owner,
            places[0],
            city.timezone,
            capturedAt,
            "private",
          );
          assert.equal(new Date(edition.capturedAt).toISOString(), capturedAt);
          assert.equal(edition.timezone, city.timezone);
          const duplicates = await Promise.all(
            Array.from({ length: 4 }, () => owner.call<EditionDto>("POST", "/api/editions", input)),
          );
          assert(duplicates.every((row) => row.id === edition.id));
          await rejects(owner.call("POST", "/api/editions", { ...input, timezone: "UTC" }), [409]);
        }
        const [count] =
          await db`SELECT count(*)::int AS count FROM editions WHERE user_id=${owner.id} AND place_id=${places[0]}`;
        assert.equal(count.count, 8);
        const stats = await owner.call<ProfileStatsDto>("GET", "/api/me/stats");
        assert(stats.stats);
        await profileOracle(db, owner.id, stats.stats);
        await rejects(
          owner.call("POST", "/api/editions", {
            requestId: randomUUID(),
            placeId: places[0],
            capturedAt: manifest.options.anchor,
            timezone: "Mars/Fake",
          }),
          [400],
        );
      },
    );
    await check("unknown locality and insufficient small-cohort metrics stay null", async () => {
      const unknown = await owner.call<PlaceDetailDto>(
        "GET",
        `/api/places/${fixtureSlug(manifest.options.runId, indexes[0])}`,
      );
      assert(unknown.metrics);
      assert.equal(unknown.metrics.discoveryFreq, null);
      assert.equal(unknown.metrics.frequency.status, "unavailable");
      assert.equal(unknown.metrics.recommendRate, null);
      for (const client of [...clients.values()].slice(0, 4)) {
        await create(client, places[1], "UTC", manifest.options.anchor, "public");
      }
      const small = await owner.call<PlaceDetailDto>(
        "GET",
        `/api/places/${fixtureSlug(manifest.options.runId, indexes[1])}`,
      );
      assert(small.metrics);
      assert.equal(small.metrics.frequency.cityVisitors90d, Math.min(4, clients.size));
      assert.equal(small.metrics.frequency.status, "insufficient");
      assert.equal(small.metrics.discoveryFreq, null);
      assert.equal(small.metrics.recommendRate, null);
      assert.equal(small.metrics.trendingScore, null);
    });
    await check("delete editions through API, replay delete and refresh projections", async () => {
      const rows = await db`SELECT id,user_id FROM editions WHERE place_id=ANY(${places}::uuid[])`;
      for (const row of rows) {
        const client = [...clients.values()].find((entry) => entry.id === row.user_id)!;
        await client.call("DELETE", `/api/editions/${row.id}`);
        await client.call("DELETE", `/api/editions/${row.id}`);
        await rejects(client.call("GET", `/api/editions/${row.id}`), [404]);
      }
      const [counts] = await db`SELECT
        (SELECT count(*)::int FROM editions WHERE place_id=ANY(${places}::uuid[])) AS editions,
        (SELECT count(*)::int FROM activity_events WHERE place_id=ANY(${places}::uuid[])) AS events`;
      assert.equal(counts.editions, 0);
      assert.equal(counts.events, 0);
      const stats = await owner.call<ProfileStatsDto>("GET", "/api/me/stats");
      assert(stats.stats);
      await profileOracle(db, owner.id, stats.stats);
      const detail = await owner.call<PlaceDetailDto>(
        "GET",
        `/api/places/${fixtureSlug(manifest.options.runId, indexes[1])}`,
      );
      assert.equal(detail.metrics?.editions, 0);
      assert.equal(detail.metrics?.collectors, 0);
    });
  } finally {
    for (const row of await db`SELECT id,user_id FROM editions WHERE place_id=ANY(${places}::uuid[])`) {
      const client = [...clients.values()].find((entry) => entry.id === row.user_id);
      assert(client, "Unknown edge edition owner");
      await client.call("DELETE", `/api/editions/${row.id}`);
    }
    for (const id of places) {
      await db`DELETE FROM edition_counters WHERE place_id=${id}
        AND user_id=ANY(${[...clients.values()].map((client) => client.id)}::uuid[])`;
      await db`DELETE FROM places WHERE id=${id} AND source='placeholder'`;
    }
  }
}
