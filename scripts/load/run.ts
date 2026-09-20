import assert from "node:assert/strict";
import type {
  EditionCreate,
  EditionDto,
  PhotoUploadDto,
  PhotoUploadRequest,
  ProfileDto,
  ProfilePatch,
  WishlistCreate,
  WishlistDto,
  WishlistItemPut,
  RankingPut,
  PlaceNoteCreate,
  PlaceNoteDto,
  PlaceTagPut,
  FriendsDto,
  FeedDto,
  LeaderboardDto,
  ProfileStatsDto,
  PlacePreferencePut,
} from "../../shared/api-contract";
import { type ApiClient } from "./api";
import { account, reconcileAccounts } from "./accounts";
import { fixtures, fixtureHash, stableId, persona } from "./fixtures";
import { database, status, type Database } from "./local";
import { Manifest } from "./manifest";
import { hash, loadPool, photoBytes, type Photo } from "./photos";
import { localUrl } from "./safety";

export function fixtureId(runId: string, index: number) {
  return stableId(`${runId}:place:${index}`);
}
export function fixtureSlug(runId: string, index: number) {
  return `load-${runId}-${index}`;
}

export async function ingest(manifest: Manifest, db: Database) {
  assert.equal(manifest.options.fixtureHash, fixtureHash, "Fixture version changed");
  for (const [index, fixture] of fixtures.entries()) {
    const id = fixtureId(manifest.options.runId, index);
    const key = `place:${index}`;
    if (!manifest.has(key, "place")) manifest.append({ kind: "place", key, id, index });
    await db`
      INSERT INTO places (id,slug,name,category,lat,lng,city,country,timezone,description,
        source,visibility,hero_image_url,rarity_tier,rarity_appeal,rarity_discovery_freq,rarity_availability)
      VALUES (${id},${fixtureSlug(manifest.options.runId, index)},${fixture.name},${fixture.category},
        ${fixture.lat},${fixture.lng},${fixture.city},${fixture.country},${fixture.timezone},
        ${fixture.description},'placeholder','public',NULL,'common',0,0,0)
      ON CONFLICT (id) DO NOTHING`;
    const [row] = await db`SELECT slug,source FROM places WHERE id=${id}`;
    assert(
      row.slug === fixtureSlug(manifest.options.runId, index) && row.source === "placeholder",
      "Fixture ID collision",
    );
  }
}

export async function bounded<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let cursor = 0;
  let failure: unknown;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!failure && cursor < items.length) {
        const item = items[cursor++];
        try {
          await work(item);
        } catch (error) {
          failure = error;
        }
      }
    }),
  );
  if (failure) throw failure;
}

export async function preflight(client: ApiClient, mode: "core" | "worldwide") {
  if (mode === "core") return;
  const profile = await client.call<ProfileStatsDto>("GET", "/api/me");
  assert("stats" in profile, "Integration pending: GET /api/me must include stats");
  await client.call<ProfileStatsDto>("GET", "/api/me/stats");
  await client.call<FriendsDto>("GET", "/api/friends");
  await client.call<FeedDto>("GET", "/api/feed?limit=2");
  await client.call<LeaderboardDto>("GET", "/api/leaderboard?scope=global&limit=2");
}

export async function editionInput(
  manifest: Manifest,
  client: ApiClient,
  index: number,
  visitIndex: number,
  pool: Photo[],
): Promise<EditionCreate> {
  const visit = persona(manifest.options.seed, index, manifest.options.editions).visits[visitIndex];
  const requestId = stableId(`${manifest.options.runId}:edition:${index}:${visitIndex}`);
  let photoPath: string | null = null;
  if (pool.length && (manifest.options.photoMode === "pool" || visitIndex % 20 === 0)) {
    const photo = pool[(index + visitIndex) % pool.length];
    photoPath = `${client.id}/${requestId}.jpg`;
    const objectKey = `object:${index}:${visitIndex}`;
    if (!manifest.has(objectKey, "object"))
      manifest.append({ kind: "object", key: objectKey, path: photoPath, sha256: photo.sha256 });
    const upload = await client.call<PhotoUploadDto>("POST", "/api/capture/upload", {
      requestId,
      contentType: "image/jpeg",
      size: photo.bytes,
    } satisfies PhotoUploadRequest);
    assert.equal(upload.path, photoPath);
    assert.equal(upload.bucket, "captures");
    if (!upload.uploaded) await client.upload(upload.path, upload.token, photoBytes(photo));
  }
  return {
    requestId,
    placeId: fixtureId(manifest.options.runId, visit.place),
    capturedAt: new Date(
      Date.parse(manifest.options.anchor) - visit.daysAgo * 86_400_000 - index * 1000,
    ).toISOString(),
    timezone: fixtures[visit.place].timezone,
    note: "Synthetic test visit; stock capture is not a documentary photo of this destination.",
    photoPath,
    visibility: visit.visibility,
    origin: "capture",
  };
}

async function behaviors(manifest: Manifest, client: ApiClient, index: number, pool: Photo[]) {
  const person = persona(manifest.options.seed, index, manifest.options.editions);
  await client.call<ProfileDto>("PATCH", "/api/me", {
    displayName: `Synthetic ${person.type} ${index}`,
    homeCity: person.home.city,
    homeCountry: person.home.country,
    statsVisibility: index % 3 === 0 ? "private" : "public",
  } satisfies ProfilePatch);
  const wishlistKey = `wishlist:${index}`;
  let wishlist = manifest.has(wishlistKey, "wishlist")?.id;
  if (!wishlist) {
    const requestId = stableId(`${manifest.options.runId}:${wishlistKey}`);
    if (!manifest.has(wishlistKey, "intent"))
      manifest.append({ kind: "intent", key: wishlistKey, id: requestId });
    const result = await client.call<WishlistDto>("POST", "/api/wishlists", {
      requestId,
      name: "Synthetic load saves",
    } satisfies WishlistCreate);
    wishlist = result.id;
    manifest.append({ kind: "wishlist", key: wishlistKey, id: wishlist });
  }
  for (const [v, visit] of person.visits.entries()) {
    const key = `visit:${index}:${v}`;
    if (manifest.has(key)) continue;
    const requestId = stableId(`${manifest.options.runId}:edition:${index}:${v}`);
    if (!manifest.has(key, "intent")) manifest.append({ kind: "intent", key, id: requestId });
    const input = await editionInput(manifest, client, index, v, pool);
    const edition = await client.call<EditionDto>("POST", "/api/editions", input);
    manifest.append({ kind: "edition", key, id: edition.id, index });
    assert.equal(edition.userId, client.id);
    assert.equal(
      new Date(edition.capturedAt).toISOString(),
      input.capturedAt,
      "Historical capturedAt must survive API",
    );
    if (v === 0) {
      await client.call("PUT", `/api/me/places/${input.placeId}`, {
        tip: `load-private-tip-${manifest.options.runId}-${index}`,
      } satisfies PlacePreferencePut);
      const replay = await client.call<EditionDto>("POST", "/api/editions", input);
      assert.equal(replay.id, edition.id, "Edition replay duplicated the resource");
      if (edition.photo)
        assert.equal(
          hash(await client.signedBytes(edition.photo.url)),
          pool[index % pool.length].sha256,
        );
    }
    await client.call("PUT", `/api/rankings/${input.placeId}`, {
      sentiment: visit.sentiment,
      ranking: "unranked",
      visibility: visit.visibility,
    } satisfies RankingPut);
    if (v % 3 === 0)
      await client.call("PUT", `/api/wishlists/${wishlist}/items`, {
        placeId: input.placeId,
        saved: true,
        visibility: visit.visibility,
      } satisfies WishlistItemPut);
    if (manifest.options.mode === "worldwide" && v % 5 === 0) {
      const slug = fixtureSlug(manifest.options.runId, visit.place);
      const noteKey = `note:${index}:${v}`;
      const noteId = stableId(`${manifest.options.runId}:${noteKey}`);
      if (!manifest.has(noteKey, "intent"))
        manifest.append({ kind: "intent", key: noteKey, id: noteId });
      const note = await client.call<PlaceNoteDto>("POST", `/api/places/${slug}/notes`, {
        requestId: noteId,
        kind: "story",
        body: "Synthetic test note. Not destination advice.",
        visibility: visit.visibility,
      } satisfies PlaceNoteCreate);
      manifest.append({ kind: "note", key: noteKey, id: note.id });
      await client.call("PUT", `/api/places/${slug}/tags`, {
        tags: ["synthetic-test", person.type],
        visibility: visit.visibility,
      } satisfies PlaceTagPut);
    }
    manifest.append({ kind: "done", key });
  }
}

export async function run(manifest: Manifest) {
  assert(!manifest.has("run", "cleaned"), "A cleaned run cannot be resumed");
  const config = status();
  localUrl(config.DB_URL, "database");
  const db = database(config);
  const pool = manifest.options.photoMode === "none" ? [] : loadPool();
  assert.equal(
    manifest.options.poolHash,
    pool.length ? hash(JSON.stringify(pool)) : null,
    "Photo pool changed",
  );
  const clients: ApiClient[] = [];
  try {
    await reconcileAccounts(manifest, config);
    clients[0] = await account(manifest, config, 0);
    await preflight(clients[0], manifest.options.mode);
    await ingest(manifest, db);
    await bounded(
      Array.from({ length: manifest.options.accounts - 1 }, (_, i) => i + 1),
      manifest.options.concurrency,
      async (index) => {
        clients[index] = await account(manifest, config, index);
      },
    );
    await bounded(
      clients.map((client, index) => ({ client, index })),
      manifest.options.concurrency,
      async ({ client, index }) => {
        await behaviors(manifest, client, index, pool);
      },
    );
    if (manifest.options.mode === "worldwide") {
      for (let i = 0; i + 1 < clients.length; i += 2) {
        await clients[i].call("PUT", `/api/friends/${clients[i + 1].id}`, {});
        await clients[i + 1].call("PUT", `/api/friends/${clients[i].id}`, {});
        await clients[i].call("PUT", `/api/friends/${clients[i + 1].id}`, {});
      }
    }
    manifest.append({ kind: "done", key: "run" });
    console.log(
      `Completed ${clients.length} real Auth/API personas in ${manifest.options.mode} mode.`,
    );
  } finally {
    await db.end();
  }
}
