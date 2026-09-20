import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { editions, friendships, places, placeStats, users } from "@/lib/db/schema";
import { serializeSocialEditionDto, serializeSocialProfileDto } from "@/lib/contracts/serializers";
import { serializePlaceDto } from "@/lib/serializers";
import type {
  FriendDto,
  FriendsDto,
  LeaderboardDto,
  LeaderboardQuery,
  PlaceDto,
  TrendingDto,
  TrendingQuery,
  UserDetailDto,
} from "../../../shared/api-contract";
import { syncFriendActivity } from "./activity";
import { invalidRequest, notFound } from "./errors";
import { acceptedFriends, visiblePlace, visibleTo } from "./social-access";
import {
  getSetCompletion,
  getTasteOverlap,
  getUserStats,
  recomputeStats,
  serializeMetrics,
} from "./stats";
import type { Database } from "./transactions";

function pairCondition(a: string, b: string) {
  return or(
    and(eq(friendships.userId, a), eq(friendships.friendId, b)),
    and(eq(friendships.userId, b), eq(friendships.friendId, a)),
  );
}

export async function getRelationship(
  viewerId: string,
  targetId: string,
  database: Database = db,
): Promise<UserDetailDto["relationship"]> {
  viewerId = viewerId.toLowerCase();
  targetId = targetId.toLowerCase();
  if (viewerId === targetId) return "self";
  const rows = await database.select().from(friendships).where(pairCondition(viewerId, targetId));
  if (rows.some((row) => row.status === "accepted")) return "accepted";
  if (rows.some((row) => row.userId === targetId)) return "incoming";
  return rows.length ? "outgoing" : "none";
}

export async function putFriend(viewerId: string, targetId: string): Promise<FriendDto> {
  viewerId = viewerId.toLowerCase();
  targetId = targetId.toLowerCase();
  if (viewerId === targetId) invalidRequest("You cannot add yourself.");
  return db.transaction(async (tx) => {
    const [a, b] = [viewerId, targetId].sort();
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`friend:${a}:${b}`}, 0))`);
    const [target] = await tx.select().from(users).where(eq(users.id, targetId));
    if (!target) notFound("This profile is unavailable.");
    const relationship = await getRelationship(viewerId, targetId, tx);
    if (relationship === "none") {
      await tx
        .insert(friendships)
        .values({ userId: viewerId, friendId: targetId, status: "pending" });
    } else if (relationship === "incoming") {
      await tx.delete(friendships).where(pairCondition(viewerId, targetId));
      await tx.insert(friendships).values({ userId: a, friendId: b, status: "accepted" });
      await syncFriendActivity(tx, a, b);
    }
    const status =
      relationship === "incoming" || relationship === "accepted" ? "accepted" : "outgoing";
    return {
      user: serializeSocialProfileDto(target),
      status,
      tasteOverlap: status === "accepted" ? await getTasteOverlap(viewerId, targetId, tx) : null,
    };
  });
}

export async function deleteFriend(viewerId: string, targetId: string): Promise<{ deleted: true }> {
  viewerId = viewerId.toLowerCase();
  targetId = targetId.toLowerCase();
  if (viewerId === targetId) invalidRequest("You cannot remove yourself.");
  return db.transaction(async (tx) => {
    const [a, b] = [viewerId, targetId].sort();
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`friend:${a}:${b}`}, 0))`);
    await tx.delete(friendships).where(pairCondition(viewerId, targetId));
    return { deleted: true };
  });
}

export async function getFriends(viewerId: string): Promise<FriendsDto> {
  const rows = await db
    .select({ user: users })
    .from(users)
    .where(
      and(
        ne(users.id, viewerId),
        sql`EXISTS (SELECT 1 FROM friendships f WHERE
      (f.user_id = ${viewerId}::uuid AND f.friend_id = ${users.id}) OR
      (f.friend_id = ${viewerId}::uuid AND f.user_id = ${users.id}))`,
      ),
    )
    .orderBy(asc(users.displayName), asc(users.id));
  const friends: FriendDto[] = [];
  for (const { user } of rows) {
    const status = await getRelationship(viewerId, user.id);
    if (status === "self" || status === "none") continue;
    friends.push({
      user: serializeSocialProfileDto(user),
      status,
      tasteOverlap: status === "accepted" ? await getTasteOverlap(viewerId, user.id) : null,
    });
  }
  return { friends };
}

export async function searchFriends(viewerId: string, query: { q: string; limit: number }) {
  const term = query.q.replace(/[\\%_]/g, "\\$&");
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        ne(users.id, viewerId),
        or(ilike(users.handle, `${term}%`), ilike(users.displayName, `${term}%`)),
      ),
    )
    .orderBy(asc(users.handle), asc(users.id))
    .limit(query.limit);
  return rows.map(serializeSocialProfileDto);
}

export async function getUserDetail(viewerId: string, targetId: string): Promise<UserDetailDto> {
  const [user] = await db.select().from(users).where(eq(users.id, targetId));
  if (!user) notFound("This profile is unavailable.");
  const relationship = await getRelationship(viewerId, targetId);
  const canReadEditions = relationship === "self" || relationship === "accepted";
  const rows = canReadEditions
    ? await db
        .select({ edition: editions })
        .from(editions)
        .innerJoin(places, eq(places.id, editions.placeId))
        .where(
          and(
            eq(editions.userId, targetId),
            visibleTo(viewerId, sql`${editions.userId}`, sql`${editions.visibility}`),
            visiblePlace(viewerId),
          ),
        )
        .orderBy(desc(editions.capturedAt), desc(editions.id))
        .limit(100)
    : [];
  return {
    user: serializeSocialProfileDto(user),
    relationship,
    stats: await getUserStats(viewerId, targetId),
    setCompletion: canReadEditions ? await getSetCompletion(viewerId, targetId) : [],
    tasteOverlap: relationship === "accepted" ? await getTasteOverlap(viewerId, targetId) : null,
    editions: rows.map(({ edition }) => serializeSocialEditionDto(edition)),
  };
}

export function socialPlaceDto(row: typeof places.$inferSelect): PlaceDto {
  return { ...serializePlaceDto(row), stats: null, externalIds: null, heroImageUrl: null };
}

export async function getLeaderboard(
  viewerId: string,
  query: LeaderboardQuery,
): Promise<LeaderboardDto> {
  const friends = query.scope === "friends";
  const rows = await db.execute<{ id: string; rank: number; placesVisited: number }>(sql`
    WITH counts AS (
      SELECT u.id, count(DISTINCT p.id)::int n FROM users u
      LEFT JOIN editions e ON e.user_id = u.id
        AND e.captured_at < now()
        AND ${friends ? visibleTo(viewerId, sql`e.user_id`, sql`e.visibility`) : sql`e.visibility = 'public'`}
      LEFT JOIN places p ON p.id = e.place_id
        AND ${friends ? visibleTo(viewerId, sql`p.owner_id`, sql`p.visibility`) : sql`p.visibility = 'public'`}
        ${query.scope === "city" ? sql`AND p.city = ${query.city} AND p.country = ${query.country}` : sql``}
      WHERE ${
        friends
          ? sql`(u.id = ${viewerId}::uuid OR ${acceptedFriends(viewerId, sql`u.id`)}) AND ${visibleTo(viewerId, sql`u.id`, sql`u.stats_visibility`)}`
          : sql`u.stats_visibility = 'public'`
      }
      GROUP BY u.id
      ${query.scope === "city" ? sql`HAVING count(DISTINCT p.id) > 0` : sql``}
    ), ranked AS (SELECT id, n, rank() OVER (ORDER BY n DESC)::int rank FROM counts)
    SELECT id, rank, n AS "placesVisited" FROM ranked ORDER BY n DESC, id LIMIT ${query.limit} OFFSET ${query.offset}
  `);
  const profiles = rows.length
    ? await db
        .select()
        .from(users)
        .where(
          inArray(
            users.id,
            rows.map((row) => row.id),
          ),
        )
    : [];
  return {
    entries: rows.flatMap((row) => {
      const user = profiles.find((profile) => profile.id === row.id);
      return user
        ? [
            {
              user: serializeSocialProfileDto(user),
              rank: row.rank,
              placesVisited: row.placesVisited,
            },
          ]
        : [];
    }),
    scope: query.scope,
    city: query.city ?? null,
    country: query.country ?? null,
    computedAt: new Date().toISOString(),
  };
}

export async function getTrending(viewerId: string, query: TrendingQuery): Promise<TrendingDto> {
  const targets = await db
    .select({ id: places.id, computedAt: placeStats.computedAt })
    .from(places)
    .leftJoin(placeStats, eq(placeStats.placeId, places.id))
    .where(
      and(
        eq(places.city, query.city),
        eq(places.country, query.country),
        eq(places.visibility, "public"),
      ),
    );
  if (targets.some((row) => !row.computedAt || Date.now() - row.computedAt.getTime() > 300_000)) {
    await recomputeStats({ placeIds: targets.map((row) => row.id) });
  }
  const rows = await db
    .select({ place: places, metric: placeStats })
    .from(places)
    .innerJoin(placeStats, eq(placeStats.placeId, places.id))
    .where(
      and(
        eq(places.city, query.city),
        eq(places.country, query.country),
        eq(places.visibility, "public"),
        visiblePlace(viewerId),
        sql`${placeStats.trendingScore} IS NOT NULL`,
      ),
    )
    .orderBy(desc(placeStats.trendingScore), asc(places.id))
    .limit(query.limit);
  return {
    places: rows.map(({ place, metric }) => ({
      ...socialPlaceDto(place),
      metrics: serializeMetrics(metric),
    })),
    city: query.city,
    country: query.country,
    computedAt: rows.length
      ? new Date(Math.min(...rows.map((row) => row.metric.computedAt.getTime()))).toISOString()
      : null,
  };
}
