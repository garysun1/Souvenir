import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type {
  CollectionEntryDto,
  FeedDto,
  FriendsDto,
  LeaderboardDto,
  PlaceDetailDto,
  ProfileDto,
  ProfileStatsDto,
  UserDetailDto,
} from "../../shared/api-contract";
import { account, reconcileAccounts } from "./accounts";
import { ApiClient, ApiFailure, latencyReport } from "./api";
import { appEnvironment, database, status, type Database } from "./local";
import { type Manifest } from "./manifest";
import { explainOracle, integrityOracle, metricsOracle, profileOracle } from "./oracle";
import { fixtureId, fixtureSlug } from "./run";
import { persona } from "./fixtures";
import { ROOT, SUPABASE_ORIGIN, guardedFetch } from "./safety";

type Check = { name: string; status: "passed" | "failed" | "blocked"; detail?: string };
async function denied(client: ApiClient, method: string, path: string, body?: object) {
  await assert.rejects(
    client.call(method, path, body),
    (error: unknown) => error instanceof ApiFailure && [400, 403, 404].includes(error.status),
  );
}

async function feedOracle(db: Database, viewer: ApiClient) {
  const seen = new Set<string>();
  let cursor: string | null = null;
  let previous: { createdAt: string; id: string } | undefined;
  for (let page = 0; page < 5; page++) {
    const feed: FeedDto = await viewer.call(
      "GET",
      `/api/feed?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    assert(!JSON.stringify(feed).includes("load-private-tip-"), "Feed exposed a private tip");
    for (const event of feed.events) {
      assert(!seen.has(event.id), "Cursor page duplicates an event");
      if (previous)
        assert(
          event.createdAt < previous.createdAt ||
            (event.createdAt === previous.createdAt && event.id < previous.id),
          "Feed order is not descending tuple",
        );
      previous = event;
      seen.add(event.id);
      const [row] = await db`
        SELECT a.id FROM activity_events a
        JOIN friendships f ON f.status='accepted' AND
          ((f.user_id=${viewer.id} AND f.friend_id=a.user_id) OR (f.friend_id=${viewer.id} AND f.user_id=a.user_id))
        LEFT JOIN editions e ON e.id=a.edition_id
        LEFT JOIN place_notes n ON n.id=a.note_id
        LEFT JOIN rankings r ON r.user_id=a.user_id AND r.place_id=a.ranking_place_id
        LEFT JOIN places p ON p.id=a.place_id
        WHERE a.id=${event.id} AND a.visibility<>'private'
          AND (p.id IS NULL OR p.visibility='public')
          AND (a.kind<>'edition' OR e.visibility<>'private')
          AND (a.kind<>'note' OR (n.visibility<>'private' AND NOT n.legacy_tip))
          AND (a.kind<>'ranking' OR r.visibility<>'private')`;
      assert(row, "Feed leaked an unauthorized or revoked target");
      if (event.kind === "edition") {
        assert.deepEqual(
          Object.keys(event.edition).sort(),
          ["capturedAt", "id", "placeId", "userId", "variant"].sort(),
        );
      }
    }
    if (!feed.nextCursor) break;
    assert.notEqual(feed.nextCursor, cursor, "Cursor did not advance");
    cursor = feed.nextCursor;
  }
  return cursor;
}

async function socialOracle(
  db: Database,
  viewer: ApiClient,
  place: string,
  detail: PlaceDetailDto,
) {
  const [counts] = await db`
    WITH friends AS (
      SELECT CASE WHEN user_id=${viewer.id} THEN friend_id ELSE user_id END AS id
      FROM friendships WHERE status='accepted' AND (user_id=${viewer.id} OR friend_id=${viewer.id})
    )
    SELECT (SELECT count(DISTINCT e.user_id)::int FROM editions e JOIN friends f ON f.id=e.user_id WHERE e.place_id=${place} AND e.visibility<>'private') AS been,
      (SELECT count(DISTINCT s.user_id)::int FROM wishlist_saves s JOIN friends f ON f.id=s.user_id WHERE s.place_id=${place} AND s.visibility<>'private') AS saved`;
  assert.equal(detail.social.friendsBeen, counts.been);
  assert.equal(detail.social.friendsSaved, counts.saved);
}

async function leaderboardOracle(db: Database, viewer: ApiClient) {
  const board = await viewer.call<LeaderboardDto>("GET", "/api/leaderboard?scope=global&limit=50");
  const rows = await db`
    WITH counts AS (
      SELECT u.id,count(DISTINCT e.place_id)::int AS places
      FROM users u LEFT JOIN editions e ON e.user_id=u.id
      WHERE u.stats_visibility='public' GROUP BY u.id
    )
    SELECT id,places,rank() OVER (ORDER BY places DESC)::int AS rank
    FROM counts ORDER BY places DESC,id LIMIT 50`;
  assert.deepEqual(
    board.entries.map((entry) => ({
      id: entry.user.id,
      places: entry.placesVisited,
      rank: entry.rank,
    })),
    rows.map((row) => ({ id: row.id, places: row.places, rank: row.rank })),
  );
  const replay = await viewer.call<LeaderboardDto>("GET", "/api/leaderboard?scope=global&limit=50");
  assert.deepEqual(replay.entries, board.entries, "Leaderboard tie order changed");
}

export async function report(manifest: Manifest) {
  assert(!manifest.has("run", "cleaned"), "Cannot verify a cleaned run");
  const config = status();
  const db = database(config);
  const checks: Check[] = [];
  const clients = new Map<number, ApiClient>();
  const sampled = [
    ...new Set([0, 1, 2, Math.floor(manifest.options.accounts / 2), manifest.options.accounts - 1]),
  ].filter((index) => index < manifest.options.accounts);
  let plans: unknown;
  const check = async (name: string, action: () => Promise<void>) => {
    try {
      await action();
      checks.push({ name, status: "passed" });
    } catch (error) {
      const blocked = error instanceof ApiFailure && [404, 405, 501].includes(error.status);
      checks.push({
        name,
        status: blocked ? "blocked" : "failed",
        detail:
          error instanceof ApiFailure
            ? error.message
            : error instanceof Error
              ? error.message.split("\n")[0]
              : "Oracle failed",
      });
    }
  };
  try {
    await reconcileAccounts(manifest, config);
    for (const index of sampled) clients.set(index, await account(manifest, config, index));
    const ids = manifest.records
      .filter((record) => record.kind === "account")
      .map((record) => {
        assert(record.id);
        return record.id;
      });
    await check("recorded accounts and deterministic edition totals", async () => {
      assert.equal(ids.length, manifest.options.accounts);
      const [counts] =
        await db`SELECT count(*)::int AS count FROM editions WHERE user_id=ANY(${ids}::uuid[])`;
      let total = 0;
      for (let index = 0; index < manifest.options.accounts; index++)
        total += persona(manifest.options.seed, index, manifest.options.editions).visits.length;
      assert.equal(counts.count, total);
    });
    for (const [index, client] of clients) {
      await check(`profile and collection SQL parity sample ${index}`, async () => {
        const profile = await client.call<ProfileDto>("GET", "/api/me");
        assert.equal(profile.id, client.id);
        const collection = await client.call<CollectionEntryDto[]>("GET", "/api/me/collection");
        const rows =
          await db`SELECT id FROM editions WHERE user_id=${client.id} ORDER BY captured_at DESC,id DESC`;
        assert.deepEqual(
          collection.map((edition) => edition.id),
          rows.map((row) => row.id),
        );
        assert(collection.every((edition) => edition.userId === client.id));
      });
      if (manifest.options.mode === "worldwide")
        await check(`profile stats SQL parity sample ${index}`, async () => {
          const profile = await client.call<ProfileStatsDto>("GET", "/api/me");
          assert(profile.stats);
          await profileOracle(db, client.id, profile.stats);
          const explicit = await client.call<ProfileStatsDto>("GET", "/api/me/stats");
          assert(explicit.stats);
          await profileOracle(db, client.id, explicit.stats);
        });
    }
    const first = clients.get(0);
    const second = clients.get(1);
    assert(first && second);
    await check("real bearer PostgREST revocation and private Storage boundary", async () => {
      await first.verifyDataBoundary();
      const object = manifest.has("object:0:0", "object");
      if (object?.path) {
        const response = await guardedFetch(SUPABASE_ORIGIN)(
          `${SUPABASE_ORIGIN}/storage/v1/object/public/captures/${object.path}`,
        );
        assert([400, 403, 404].includes(response.status), "Private capture was publicly readable");
      }
    });
    await check("foreign edition/photo and forged owner isolation", async () => {
      const edition = manifest.has("visit:0:0", "edition");
      assert(edition?.id);
      await denied(second, "GET", `/api/editions/${edition.id}`);
      await denied(second, "GET", `/api/editions/${edition.id}/photo`);
      await denied(second, "PATCH", "/api/me", { userId: first.id, displayName: "Forged owner" });
      const object = manifest.has("object:0:0", "object");
      if (object?.path)
        await denied(second, "POST", "/api/editions", {
          requestId: object.path.split("/")[1].slice(0, -4),
          placeId: fixtureId(manifest.options.runId, 0),
          capturedAt: manifest.options.anchor,
          timezone: "UTC",
          photoPath: object.path,
        });
    });
    await check("referential integrity, media ownership, orphan events and RLS grants", async () =>
      integrityOracle(db, ids),
    );
    await check("EXPLAIN index eligibility", async () => {
      plans = await explainOracle(db, first.id, fixtureId(manifest.options.runId, 0));
    });
    if (manifest.options.mode === "worldwide") {
      for (const index of [0, 20, 40, 60, 80, 100, 120, 140]) {
        await check(`place metrics and friends SQL parity fixture ${index}`, async () => {
          const detail = await first.call<PlaceDetailDto>(
            "GET",
            `/api/places/${fixtureSlug(manifest.options.runId, index)}`,
          );
          assert(detail.metrics);
          await metricsOracle(db, detail.id, detail.metrics);
          await socialOracle(db, first, detail.id, detail);
          assert.equal(detail.heroImageUrl, null, "Synthetic stock must not become a hero");
          assert(!JSON.stringify(detail.sources).includes('"payload"'));
        });
      }
      await check("feed privacy and strict cursor pagination", async () => {
        await feedOracle(db, first);
      });
      await check("global leaderboard SQL ordering and deterministic ties", async () =>
        leaderboardOracle(db, first),
      );
      await check("non-friend private profile isolation", async () => {
        const third = clients.get(2);
        assert(third, "Worldwide validation requires at least three accounts");
        const result = await third.call<UserDetailDto>("GET", `/api/users/${first.id}`);
        assert.equal(result.relationship, "none");
        assert.equal(result.stats, null);
        const forbidden =
          await db`SELECT id FROM editions WHERE user_id=${first.id} AND visibility<>'public'`;
        assert(!result.editions.some((edition) => forbidden.some((row) => row.id === edition.id)));
        for (const edition of result.editions)
          assert.deepEqual(
            Object.keys(edition).sort(),
            ["capturedAt", "id", "placeId", "userId", "variant"].sort(),
          );
        const visit = persona(manifest.options.seed, 0, manifest.options.editions).visits[0];
        const detail = await third.call<PlaceDetailDto>(
          "GET",
          `/api/places/${fixtureSlug(manifest.options.runId, visit.place)}`,
        );
        const marker = `load-private-tip-${manifest.options.runId}-0`;
        assert(
          !JSON.stringify(result).includes(marker),
          "Non-friend profile exposed a private tip",
        );
        assert(
          !JSON.stringify(detail).includes(marker),
          "Place detail exposed another user's private tip",
        );
      });
      await check("friend convergence and cursor privacy after revocation", async () => {
        const before = await first.call<FeedDto>("GET", "/api/feed?limit=1");
        try {
          await first.call("DELETE", `/api/friends/${second.id}`);
          const after = await first.call<FeedDto>(
            "GET",
            `/api/feed?limit=50${before.nextCursor ? `&cursor=${encodeURIComponent(before.nextCursor)}` : ""}`,
          );
          assert(!after.events.some((event) => event.user.id === second.id));
          const [relations] =
            await db`SELECT count(*)::int AS count FROM friendships WHERE (user_id=${first.id} AND friend_id=${second.id}) OR (user_id=${second.id} AND friend_id=${first.id})`;
          assert.equal(relations.count, 0);
        } finally {
          await Promise.all([
            first.call("PUT", `/api/friends/${second.id}`, {}),
            second.call("PUT", `/api/friends/${first.id}`, {}),
          ]);
        }
        const friends = await first.call<FriendsDto>("GET", "/api/friends");
        assert.equal(
          friends.friends.filter(
            (friend) => friend.user.id === second.id && friend.status === "accepted",
          ).length,
          1,
        );
      });
      await check("metric freshness after visibility change", async () => {
        const [edition] =
          await db`SELECT id,place_id FROM editions WHERE user_id=${first.id} AND visibility='public' LIMIT 1`;
        assert(edition, "At least three visits are required");
        const [place] = await db`SELECT slug FROM places WHERE id=${edition.place_id}`;
        try {
          await first.call("PATCH", `/api/editions/${edition.id}`, { visibility: "private" });
          const detail = await first.call<PlaceDetailDto>("GET", `/api/places/${place.slug}`);
          assert(detail.metrics);
          await metricsOracle(db, detail.id, detail.metrics);
        } finally {
          await first.call("PATCH", `/api/editions/${edition.id}`, { visibility: "public" });
        }
      });
    } else {
      checks.push({
        name: "worldwide stats, metrics, friends, notes/tags, feed and leaderboards",
        status: "blocked",
        detail:
          "Core infrastructure smoke intentionally excludes pending worldwide service implementations.",
      });
    }
    if (manifest.options.mode === "worldwide") {
      await check("incremental/full recomputation drift", async () => {
        const snapshot = async () => ({
          places:
            await db`SELECT place_id, to_jsonb(s) - ARRAY['computed_at','window_start','window_end','baseline_start','baseline_end'] AS counts
            FROM place_stats s WHERE place_id IN (
              SELECT id FROM places WHERE slug LIKE ${`load-${manifest.options.runId}-%`}
            ) ORDER BY place_id`,
          users: await db`SELECT user_id, to_jsonb(s) - 'computed_at' AS counts
            FROM user_stats s WHERE user_id=ANY(${ids}::uuid[]) ORDER BY user_id`,
        });
        const before = await snapshot();
        assert(
          before.places.length > 0 && before.users.length > 0,
          "Missing incremental projections",
        );
        execFileSync(
          process.execPath,
          ["--import", "tsx", resolve(ROOT, "scripts/recompute-stats.ts")],
          { cwd: ROOT, env: appEnvironment(status()), stdio: "pipe" },
        );
        assert.deepEqual(await snapshot(), before);
      });
    }
  } finally {
    await db.end();
    const result = {
      runId: manifest.options.runId,
      mode: manifest.options.mode,
      fixtureHash: manifest.options.fixtureHash,
      poolHash: manifest.options.poolHash,
      anchor: manifest.options.anchor,
      sampledAccountIndexes: sampled,
      processElapsedSeconds: process.uptime(),
      generatedAt: new Date().toISOString(),
      checks,
      latency: latencyReport(),
      explain: plans,
      scope:
        "Real local Auth + Storage + bearer Next API; SQL oracle. No browser test. No provider coverage or real-place license verification implied by synthetic fixtures.",
    };
    const serialized = JSON.stringify(result, null, 2);
    writeFileSync(resolve(manifest.dir, `report-${Date.now()}.json`), serialized, {
      mode: 0o600,
    });
    writeFileSync(resolve(manifest.dir, "report.json"), serialized, {
      mode: 0o600,
    });
    console.log(`Report: out/load/runs/${manifest.options.runId}/report.json`);
    console.log(
      checks
        .map(
          (item) =>
            `${item.status}: ${item.name}${item.status === "failed" ? ` (${item.detail})` : ""}`,
        )
        .join("\n"),
    );
  }
  assert(!checks.some((item) => item.status === "failed"), "Load report has failed checks");
  if (manifest.options.mode === "worldwide")
    assert(!checks.some((item) => item.status === "blocked"), "Worldwide endpoints remain blocked");
}
