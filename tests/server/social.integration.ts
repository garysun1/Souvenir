import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import {
  activityEvents,
  editions,
  friendships,
  placeNotes,
  places,
  placeStats,
  rankingGroups,
  setPlaces,
  sets,
  users,
  userStats,
} from "@/lib/db/schema";
import { afterPlaceChange, syncEditionActivity, syncNoteActivity } from "@/lib/server/activity";
import { createEdition, deleteEdition, updateEdition } from "@/lib/server/editions";
import { getFeed } from "@/lib/server/feed";
import { putRanking } from "@/lib/server/rankings";
import {
  deleteFriend,
  getLeaderboard,
  getRelationship,
  getTrending,
  getUserDetail,
  putFriend,
  searchFriends,
} from "@/lib/server/social";
import {
  getPlaceMetrics,
  getPlaceSocial,
  getSetCompletion,
  getTasteOverlap,
  getUserStats,
  recomputeStats,
} from "@/lib/server/stats";
import {
  addWishlistMember,
  createWishlist,
  putWishlistItem,
  removeWishlistMember,
} from "@/lib/server/wishlists";
import { signCapturePhoto } from "@/lib/auth/storage";
import { GET as feedRoute } from "@/app/api/feed/route";
import { GET as statsRoute } from "@/app/api/me/stats/route";
import { GET as leaderboardRoute } from "@/app/api/leaderboard/route";
import { PUT as friendRoute } from "@/app/api/friends/[userId]/route";
import type { AuthContext, EditionCreate, Visibility } from "../../shared/api-contract";

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: async (request: Request) => {
    const userId = request.headers.get("x-test-user");
    return userId
      ? { auth: { userId, email: null, mode: "bearer" } }
      : { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  },
}));
vi.mock("@/lib/auth/storage", () => ({
  verifyCapturePhoto: vi.fn(async () => ({ size: 1024, contentType: "image/jpeg" })),
  signCapturePhoto: vi.fn(async () => ({
    path: "private",
    url: "https://photos.test/signed",
    expiresAt: new Date().toISOString(),
  })),
  deleteCapturePhoto: vi.fn(async () => undefined),
}));

const people = Array.from({ length: 8 }, () => randomUUID());
const spots = Array.from({ length: 7 }, () => randomUUID());
const day = 86_400_000;
const now = new Date();
const recent = new Date(now.getTime() - day);
const auth = (index: number): AuthContext => ({
  userId: people[index],
  email: null,
  mode: "bearer",
});
const input = (placeId = spots[0], extra: Partial<EditionCreate> = {}): EditionCreate => ({
  requestId: randomUUID(),
  placeId,
  capturedAt: recent.toISOString(),
  timezone: "UTC",
  visibility: "public",
  ...extra,
});
async function visit(
  user: number,
  place: number,
  when = recent,
  visibility: Visibility = "public",
) {
  const [sequence] = await db.execute<{ n: number }>(
    sql`SELECT coalesce(max(visit_sequence), 0)::int + 1 n FROM editions WHERE user_id = ${people[user]}::uuid AND place_id = ${spots[place]}::uuid`,
  );
  const [row] = await db
    .insert(editions)
    .values({
      userId: people[user],
      placeId: spots[place],
      capturedAt: when,
      timezone: "UTC",
      requestId: randomUUID(),
      visitSequence: sequence.n,
      visibility,
    })
    .returning();
  return row;
}
async function accept(a: number, b: number) {
  await putFriend(people[a], people[b]);
  await putFriend(people[b], people[a]);
}
function request(path: string, method = "GET", body?: unknown, user: string = people[0]) {
  return new Request(`https://souvenir.test/api${path}`, {
    method,
    headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function metrics() {
  const rows = await db.select().from(placeStats).orderBy(asc(placeStats.placeId));
  return rows.map((row) => ({ ...row, computedAt: null, windowStart: null, windowEnd: null }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.execute(sql`TRUNCATE users, places, sets CASCADE`);
  await db.insert(users).values(
    people.map((id, index) => ({
      id,
      handle: `collector${index}`,
      displayName: `Collector ${index}`,
      statsVisibility: "public" as const,
    })),
  );
  await db.insert(places).values(
    spots.map((id, index) => ({
      id,
      slug: `destination-${index}`,
      name: `Destination ${index}`,
      category: "nature" as const,
      lat: 0,
      lng: 0,
      city: index === 4 ? null : index === 3 ? "London" : "Springfield",
      country: index === 4 ? null : index === 2 ? "CA" : index === 3 ? "GB" : "US",
      description: "Test destination",
      rarityTier: "rare" as const,
      rarityAppeal: 87,
      rarityDiscoveryFreq: 13,
      rarityAvailability: 41,
      visibility: index === 5 ? ("private" as const) : ("public" as const),
      ownerId: index === 5 ? people[6] : null,
      stats: { mustNotLeak: "raw-provider" },
      externalIds: { raw: "private-provider" },
    })),
  );
});
afterAll(closeDb);

describe("public metrics and incremental updates", () => {
  it("matches independent SQL oracles across localities, repetitions, normalized sentiments and eight weekly cohorts", async () => {
    await visit(0, 0);
    await visit(1, 0);
    await visit(1, 0);
    for (const user of [0, 2, 3, 4]) await visit(user, 1);
    await visit(5, 2);
    await visit(6, 2);
    await visit(6, 3);
    await visit(6, 4);
    await visit(6, 5);
    await visit(6, 0, recent, "private");
    const [window] = await db.execute<{ start: string }>(
      sql`SELECT (date_trunc('week', (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC') - interval '7 days') - interval '56 days')::text start`,
    );
    const baseline = new Date(`${window.start.replace(" ", "T")}Z`);
    for (let week = 0; week < 8; week++) {
      await visit(7, 0, new Date(baseline.getTime() + (week * 7 + 1) * day));
      await visit(7, 0, new Date(baseline.getTime() + (week * 7 + 2) * day));
    }
    await visit(5, 0, new Date(now.getTime() - 91 * day));
    const sentiments = ["recommend", "recommend", "recommend", "depends", "skip"] as const;
    for (let user = 0; user < 5; user++) {
      if (user > 1) await visit(user, 0, new Date(now.getTime() - 91 * day), "private");
      await putRanking(people[user], spots[0], {
        sentiment: sentiments[user],
        ranking: "unranked",
        visibility: "public",
      });
    }
    await db.insert(rankingGroups).values({
      userId: people[0],
      category: "nature",
      sentiment: "recommend",
      placeIds: [spots[0]],
      provisionalIds: [],
      ties: [],
    });
    await recomputeStats({ now });
    const [oracle] = await db.execute<{
      visitors: number;
      cohort: number;
      editions: number;
      collectors: number;
    }>(sql`
      SELECT count(*)::int editions, count(DISTINCT e.user_id)::int collectors,
        count(DISTINCT e.user_id) FILTER (WHERE e.captured_at >= ${now.toISOString()}::timestamptz - interval '90 days')::int visitors,
        (SELECT count(DISTINCT e2.user_id)::int FROM editions e2 JOIN places p2 ON p2.id = e2.place_id
          WHERE p2.city = 'Springfield' AND p2.country = 'US' AND p2.visibility = 'public' AND e2.visibility = 'public'
            AND e2.captured_at >= ${now.toISOString()}::timestamptz - interval '90 days' AND e2.captured_at < ${now.toISOString()}::timestamptz) cohort
      FROM editions e WHERE e.place_id = ${spots[0]}::uuid AND e.visibility = 'public' AND e.captured_at < ${now.toISOString()}::timestamptz`);
    const result = await getPlaceMetrics(people[0], spots[0]);
    expect(oracle).toEqual({ visitors: 3, cohort: 6, editions: 20, collectors: 4 });
    expect(result).toMatchObject({
      collectors: oracle.collectors,
      editions: oracle.editions,
      discoveryFreq: 0.5,
      frequency: { visitors90d: oracle.visitors, cityVisitors90d: oracle.cohort },
      recommendRate: 0.6,
      sentiment: { recommend: 3, depends: 1, skip: 1 },
      trendingScore: 2,
      trend: { collectors7d: 2, weeklyCollectors8w: Array(8).fill(1), collectors8wAvg: 1 },
    });
    expect(await getPlaceMetrics(people[0], spots[2])).toMatchObject({
      discoveryFreq: null,
      frequency: { cityVisitors90d: 2, status: "insufficient" },
      trendingScore: null,
    });
    expect(await getPlaceMetrics(people[0], spots[4])).toMatchObject({
      discoveryFreq: null,
      frequency: { status: "unavailable" },
    });
    const [place] = await db.select().from(places).where(eq(places.id, spots[0]));
    expect([place.rarityAppeal, place.rarityAvailability, place.rarityDiscoveryFreq]).toEqual([
      87, 41, 13,
    ]);
    const trending = await getTrending(people[0], {
      city: "Springfield",
      country: "US",
      limit: 10,
    });
    expect(trending.places.map((row) => row.id)).toEqual([spots[0]]);
    expect(JSON.stringify(trending)).not.toContain("raw-provider");
  });

  it("keeps transactional create/replay, timestamp edits, visibility, deletion and locality moves equivalent to full recompute", async () => {
    await recomputeStats();
    const body = input();
    const [created, replay] = await Promise.all([
      createEdition(auth(0), body),
      createEdition(auth(0), body),
    ]);
    expect(created.data.id).toBe(replay.data.id);
    expect(
      await db.select().from(activityEvents).where(eq(activityEvents.editionId, created.data.id)),
    ).toHaveLength(1);
    await createEdition(auth(1), input(spots[1]));
    await updateEdition(auth(0), created.data.id, {
      capturedAt: new Date(now.getTime() - 100 * day).toISOString(),
    });
    const before = await metrics();
    await recomputeStats();
    expect(await metrics()).toEqual(before);
    await db.transaction(async (tx) => {
      await tx
        .update(places)
        .set({ city: "Toronto", country: "CA" })
        .where(eq(places.id, spots[1]));
      await afterPlaceChange(tx, spots[1], { city: "Springfield", country: "US" });
    });
    const moved = await metrics();
    await recomputeStats();
    expect(await metrics()).toEqual(moved);
    await updateEdition(auth(0), created.data.id, { visibility: "private" });
    await deleteEdition(auth(0), created.data.id);
    const deleted = await metrics();
    await recomputeStats();
    expect(await metrics()).toEqual(deleted);
    expect(
      await db.select().from(activityEvents).where(eq(activityEvents.editionId, created.data.id)),
    ).toHaveLength(0);
    expect(await getUserStats(people[0], people[0])).toMatchObject({
      editions: 0,
      placesVisited: 0,
    });
  });

  it("refreshes expired rolling windows on reads without signing captures", async () => {
    await visit(0, 0, new Date(now.getTime() - 91 * day));
    await recomputeStats({ now: new Date(now.getTime() - 2 * day) });
    expect(
      (await db.select().from(placeStats).where(eq(placeStats.placeId, spots[0])))[0].visitors90d,
    ).toBe(1);
    expect(await getPlaceMetrics(people[0], spots[0])).toMatchObject({
      frequency: { visitors90d: 0 },
    });
    expect(signCapturePhoto).not.toHaveBeenCalled();
  });

  it("counts unique public savers and friend shared saves; removes departed members", async () => {
    await accept(0, 1);
    const shared = (
      await createWishlist(people[0], { name: "Shared", requestId: randomUUID(), isShared: true })
    ).data;
    await addWishlistMember(people[0], shared.id, "collector1");
    await putWishlistItem(people[1], shared.id, { placeId: spots[0], saved: true });
    expect(await getPlaceSocial(people[0], spots[0])).toEqual({ friendsBeen: 0, friendsSaved: 1 });
    expect(await getPlaceMetrics(people[0], spots[0])).toMatchObject({ saves: 0 });
    await putWishlistItem(people[1], shared.id, {
      placeId: spots[0],
      saved: true,
      visibility: "public",
    });
    const own = (await createWishlist(people[1], { name: "Own", requestId: randomUUID() })).data;
    await putWishlistItem(people[1], own.id, {
      placeId: spots[0],
      saved: true,
      visibility: "public",
    });
    expect(await getPlaceMetrics(people[0], spots[0])).toMatchObject({ saves: 1 });
    await removeWishlistMember(people[0], shared.id, people[1]);
    await putWishlistItem(people[1], own.id, { placeId: spots[0], saved: false });
    expect(await getPlaceMetrics(people[0], spots[0])).toMatchObject({ saves: 0 });
    expect(await getPlaceSocial(people[0], spots[0])).toEqual({ friendsBeen: 0, friendsSaved: 0 });
  });

  it("rebuilds 1000 collectors across eight cities without SQL parameter overflow or global user rewrites", async () => {
    const collectors = Array.from({ length: 1000 }, () => randomUUID());
    const destinations = Array.from({ length: 3200 }, () => randomUUID());
    await db.insert(users).values(
      collectors.map((id, index) => ({
        id,
        handle: `scale-${index}`,
        displayName: `Scale collector ${index}`,
      })),
    );
    await db.insert(places).values(
      destinations.map((id, index) => ({
        id,
        slug: `scale-place-${index}`,
        name: `Scale destination ${index}`,
        category: "nature" as const,
        city: `Scale city ${Math.floor(index / 400)}`,
        country: "US",
        lat: 0,
        lng: 0,
        description: "Disposable test destination",
        rarityTier: "common" as const,
        rarityAppeal: 0,
        rarityDiscoveryFreq: 0,
        rarityAvailability: 0,
      })),
    );
    await db.insert(editions).values(
      collectors.map((userId, index) => ({
        userId,
        placeId: destinations[(index % 8) * 400 + Math.floor(index / 8)],
        capturedAt: recent,
        timezone: "UTC",
        requestId: randomUUID(),
        visitSequence: 1,
        visibility: "public" as const,
      })),
    );
    await recomputeStats({ now });
    const [result] = await db.execute<{
      places: number;
      users: number;
      visits: number;
      cohorts: number[];
    }>(sql`
      SELECT count(*)::int places, sum(collectors)::int visits,
        (SELECT count(*)::int FROM user_stats) users,
        (SELECT array_agg(DISTINCT city_visitors_90d) FROM place_stats WHERE city LIKE 'Scale city %') cohorts
      FROM place_stats
    `);
    expect(result).toEqual({ places: 3207, users: 1008, visits: 1000, cohorts: [125] });
    await createEdition(auth(0), input(destinations[0]));
    const [unrelated] = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, collectors[0]));
    expect(unrelated.computedAt).toEqual(now);
    expect(await getPlaceMetrics(people[0], destinations[1])).toMatchObject({
      frequency: { cityVisitors90d: 126 },
    });
    expect(await getPlaceMetrics(people[0], destinations[400])).toMatchObject({
      frequency: { cityVisitors90d: 125 },
    });
  }, 30_000);
});

describe("friendship, profiles and activity authorization", () => {
  it("serializes concurrent cross requests into one canonical accepted pair and stable removal", async () => {
    await expect(putFriend(people[0], people[0])).rejects.toMatchObject({ status: 400 });
    await expect(putFriend(people[0], people[0].toUpperCase())).rejects.toMatchObject({
      status: 400,
    });
    await putFriend(people[0], people[1]);
    expect(await getRelationship(people[0], people[1])).toBe("outgoing");
    expect(await getRelationship(people[1], people[0])).toBe("incoming");
    await deleteFriend(people[0], people[1]);
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        putFriend(people[index % 2], people[1 - (index % 2)].toUpperCase()),
      ),
    );
    const rows = await db.select().from(friendships);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: [...people.slice(0, 2)].sort()[0],
      friendId: [...people.slice(0, 2)].sort()[1],
      status: "accepted",
    });
    expect(await db.select().from(activityEvents)).toHaveLength(2);
    await Promise.all([deleteFriend(people[0], people[1]), deleteFriend(people[1], people[0])]);
    expect(await db.select().from(friendships)).toHaveLength(0);
    expect(await db.select().from(activityEvents)).toHaveLength(0);
  });

  it("enforces friends-only editions, profile preferences, public-only ranks and safe allowlists", async () => {
    await createEdition(
      auth(1),
      input(spots[0], {
        note: "secret diary",
        companions: ["secret companion"],
        visibility: "friends",
      }),
    );
    await createEdition(auth(1), input(spots[1], { visibility: "private" }));
    await createEdition(auth(1), input(spots[2], { visibility: "public" }));
    await db.update(users).set({ statsVisibility: "friends" }).where(eq(users.id, people[1]));
    expect(await getUserDetail(people[0], people[1])).toMatchObject({ editions: [], stats: null });
    await accept(0, 1);
    const profile = await getUserDetail(people[0], people[1]);
    expect(profile.editions).toHaveLength(2);
    expect(profile.stats).toMatchObject({ placesVisited: 2, editions: 2, globalRank: null });
    const feed = await getFeed(people[0], { limit: 50 });
    expect(feed.events.filter((event) => event.kind === "edition")).toHaveLength(2);
    expect(JSON.stringify(feed)).not.toMatch(
      /secret diary|secret companion|raw-provider|private-provider|photoPath|photoUrl|signed/,
    );
    expect(signCapturePhoto).not.toHaveBeenCalled();
    expect(await getPlaceSocial(people[0], spots[0])).toMatchObject({ friendsBeen: 1 });
    await deleteFriend(people[0], people[1]);
    expect(await getFeed(people[0], { limit: 50 })).toMatchObject({ events: [] });
    expect(await getPlaceSocial(people[0], spots[0])).toMatchObject({ friendsBeen: 0 });
    expect(await getUserDetail(people[0], people[1])).toMatchObject({ editions: [], stats: null });
    await expect(createEdition(auth(0), input(spots[5]))).rejects.toMatchObject({ status: 400 });
  });

  it("traverses equal and microsecond timestamps without gaps/duplicates and rechecks target visibility", async () => {
    await accept(0, 1);
    const ids: string[] = [];
    for (let index = 0; index < 9; index++)
      ids.push((await createEdition(auth(1), input())).data.id);
    await db.execute(
      sql`UPDATE activity_events SET created_at = '2026-01-01T01:01:01.123456Z' WHERE kind = 'edition'`,
    );
    const [first] = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.editionId, ids[0]));
    await db.execute(
      sql`UPDATE activity_events SET created_at = '2026-01-01T01:01:01.123457Z' WHERE id = ${first.id}::uuid`,
    );
    const all = await getFeed(people[0], { limit: 50 });
    const traversed: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await getFeed(people[0], { limit: 2, cursor });
      traversed.push(...page.events.map((event) => event.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(traversed).toEqual(all.events.map((event) => event.id));
    expect(new Set(traversed).size).toBe(traversed.length);
    await updateEdition(auth(1), ids[0], { visibility: "private" });
    await deleteEdition(auth(1), ids[1]);
    expect(
      (await getFeed(people[0], { limit: 50 })).events.filter((event) => event.kind === "edition"),
    ).toHaveLength(7);
    await db.transaction(async (tx) => {
      await tx
        .update(places)
        .set({ visibility: "private", ownerId: people[1] })
        .where(eq(places.id, spots[0]));
      await afterPlaceChange(tx, spots[0]);
    });
    expect(
      (await getFeed(people[0], { limit: 50 })).events.filter((event) => event.kind === "edition"),
    ).toHaveLength(0);
  });

  it("rolls back target/events/stats together and cascades deleted note and ranking references", async () => {
    await accept(0, 1);
    const edition = await createEdition(auth(1), input());
    await putRanking(people[1], spots[0], {
      sentiment: "recommend",
      ranking: "unranked",
      visibility: "friends",
    });
    await putRanking(people[1], spots[0], {
      sentiment: "skip",
      ranking: "unranked",
      visibility: "friends",
    });
    const [note] = await db
      .insert(placeNotes)
      .values({
        userId: people[1],
        placeId: spots[0],
        requestId: randomUUID(),
        kind: "story",
        body: "A shared story",
        visibility: "friends",
      })
      .returning();
    await db.transaction((tx) => syncNoteActivity(tx, people[1], note.id));
    expect(
      (await getFeed(people[0], { limit: 50 })).events.filter((event) => event.kind === "ranking"),
    ).toHaveLength(1);
    expect(
      (await getFeed(people[0], { limit: 50 })).events.some((event) => event.kind === "note"),
    ).toBe(true);
    await db.delete(placeNotes).where(eq(placeNotes.id, note.id));
    await deleteEdition(auth(1), edition.data.id);
    expect(
      (await getFeed(people[0], { limit: 50 })).events.every((event) => event.kind === "friend"),
    ).toBe(true);
    const row = await visit(1, 0);
    await expect(
      db.transaction(async (tx) => {
        await syncEditionActivity(tx, people[1], row.id);
        await recomputeStats({ placeIds: [spots[0]], userIds: [people[1]] }, tx);
        await tx.delete(editions).where(eq(editions.id, row.id));
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(
      await db.select().from(activityEvents).where(eq(activityEvents.editionId, row.id)),
    ).toHaveLength(0);
    expect(await db.select().from(editions).where(eq(editions.id, row.id))).toHaveLength(1);
  });

  it("computes set completion, edition-timezone ISO week streaks and overlap without repeat inflation", async () => {
    const [set] = await db
      .insert(sets)
      .values({ slug: "two", name: "Two", description: "Two destinations", city: "Springfield" })
      .returning();
    await db.insert(setPlaces).values([
      { setId: set.id, placeId: spots[0], position: 0 },
      { setId: set.id, placeId: spots[1], position: 1 },
    ]);
    await accept(0, 1);
    const first = await createEdition(
      auth(1),
      input(spots[0], {
        capturedAt: "2025-01-06T00:30:00Z",
        timezone: "America/Los_Angeles",
        visibility: "friends",
      }),
    );
    const second = await createEdition(
      auth(1),
      input(spots[1], {
        capturedAt: "2025-01-12T20:00:00Z",
        timezone: "America/Los_Angeles",
        visibility: "friends",
      }),
    );
    await createEdition(
      auth(1),
      input(spots[0], {
        capturedAt: first.data.capturedAt,
        timezone: "America/Los_Angeles",
        visibility: "friends",
      }),
    );
    await createEdition(auth(0), input(spots[0]));
    expect(await getUserStats(people[1], people[1])).toMatchObject({
      longestStreakWeeks: 2,
      currentStreakWeeks: 0,
    });
    expect(await getSetCompletion(people[0], people[1])).toEqual([
      { setId: set.id, total: 2, visited: 2, rate: 1 },
    ]);
    expect(await getTasteOverlap(people[0], people[1])).toBe(0.5);
    expect(
      (await getFeed(people[0], { limit: 50 })).events.filter(
        (event) => event.kind === "set_complete",
      ),
    ).toHaveLength(1);
    await db.transaction(async (tx) => {
      await tx
        .update(places)
        .set({ visibility: "friends", ownerId: people[1] })
        .where(eq(places.id, spots[1]));
      await afterPlaceChange(tx, spots[1]);
    });
    expect(
      (await getFeed(people[0], { limit: 50 })).events.filter(
        (event) => event.kind === "set_complete",
      ),
    ).toHaveLength(1);
    await deleteEdition(auth(1), second.data.id);
    expect(
      (await getFeed(people[0], { limit: 50 })).events.filter(
        (event) => event.kind === "set_complete",
      ),
    ).toHaveLength(0);
    await db
      .update(places)
      .set({ visibility: "private", ownerId: null })
      .where(eq(places.id, spots[0]));
    expect(await getSetCompletion(people[0], people[1])).toEqual([]);
  });

  it("orders leaderboard ties stably, separates countries, and excludes private contributions", async () => {
    await visit(0, 0);
    await visit(0, 0);
    await visit(1, 1);
    await visit(2, 2);
    await visit(3, 0, recent, "private");
    await visit(3, 1, recent, "private");
    const query = { scope: "global" as const, limit: 8, offset: 0 };
    const board = await getLeaderboard(people[0], query);
    expect(board.entries.slice(0, 3).map((row) => row.user.id)).toEqual(people.slice(0, 3).sort());
    expect(board.entries.slice(0, 3).map((row) => row.rank)).toEqual([1, 1, 1]);
    expect(
      (
        await getLeaderboard(people[0], {
          ...query,
          scope: "city",
          city: "Springfield",
          country: "CA",
        })
      ).entries.map((row) => row.user.id),
    ).toEqual([people[2]]);
    const paged = await Promise.all(
      [0, 2, 4, 6].map((offset) => getLeaderboard(people[0], { ...query, limit: 2, offset })),
    );
    expect(paged.flatMap((page) => page.entries)).toEqual(board.entries);
    await recomputeStats({ placeIds: [spots[0]], userIds: [people[0]] });
    expect(await db.select().from(userStats)).toHaveLength(1);
  });

  it("validates authenticated routes and rejects actor injection, repeated parameters, malformed cursors and missing locality", async () => {
    expect((await feedRoute(request("/feed", "GET", undefined, ""))).status).toBe(401);
    for (const query of ["cursor=bad", "limit=1&limit=2", "userId=" + people[1]]) {
      const response = await feedRoute(request(`/feed?${query}`));
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect(
      (await leaderboardRoute(request("/leaderboard?scope=city&city=Springfield"))).status,
    ).toBe(400);
    const context = { params: Promise.resolve({ userId: people[1] }) };
    expect(
      (await friendRoute(request("/friends", "PUT", { userId: people[2] }), context)).status,
    ).toBe(400);
    expect((await friendRoute(request("/friends", "PUT", {}), context)).status).toBe(200);
    expect((await statsRoute(request("/me/stats"))).status).toBe(200);
    expect(await searchFriends(people[0], { q: "%_", limit: 20 })).toEqual([]);
  });
});
