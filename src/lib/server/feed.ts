import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  activityEvents,
  editions,
  friendships,
  placeNotes,
  places,
  rankings,
  users,
} from "@/lib/db/schema";
import { decodeFeedCursor, encodeFeedCursor } from "@/lib/contracts/api";
import { serializeSocialEditionDto, serializeSocialProfileDto } from "@/lib/contracts/serializers";
import type { ActivityEventDto, FeedDto, FeedQuery } from "../../../shared/api-contract";
import { acceptedFriends, visiblePlace, visibleTo } from "./social-access";
import { getSetCompletion } from "./stats";
import { socialPlaceDto } from "./social";

const eventTimestamp = sql<string>`to_char(${activityEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

async function visibleEvents(viewerId: string, ids: string[], limit: number) {
  const friend = alias(users, "friend_profile");
  return db
    .select({
      event: activityEvents,
      actor: users,
      place: places,
      edition: editions,
      ranking: rankings,
      note: placeNotes,
      friend,
      timestamp: eventTimestamp,
    })
    .from(activityEvents)
    .innerJoin(users, eq(users.id, activityEvents.userId))
    .leftJoin(places, eq(places.id, activityEvents.placeId))
    .leftJoin(editions, eq(editions.id, activityEvents.editionId))
    .leftJoin(placeNotes, eq(placeNotes.id, activityEvents.noteId))
    .leftJoin(
      rankings,
      and(
        eq(rankings.userId, activityEvents.userId),
        eq(rankings.placeId, activityEvents.rankingPlaceId),
      ),
    )
    .leftJoin(friend, eq(friend.id, activityEvents.friendId))
    .where(
      and(
        inArray(activityEvents.id, ids),
        acceptedFriends(viewerId, sql`${activityEvents.userId}`),
        sql`${activityEvents.visibility} <> 'private'`,
        sql`(
        (${activityEvents.kind} = 'edition' AND ${editions.visibility} <> 'private' AND ${visiblePlace(viewerId)})
        OR (${activityEvents.kind} = 'ranking' AND ${rankings.visibility} <> 'private' AND ${visiblePlace(viewerId)})
        OR (${activityEvents.kind} = 'note' AND ${placeNotes.visibility} <> 'private' AND NOT ${placeNotes.legacyTip} AND ${visiblePlace(viewerId)})
        OR (${activityEvents.kind} = 'friend'
          AND (${friend.id} = ${viewerId}::uuid OR ${acceptedFriends(viewerId, sql`${friend.id}`)})
          AND EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted'
            AND ((f.user_id = ${activityEvents.userId} AND f.friend_id = ${activityEvents.friendId})
              OR (f.friend_id = ${activityEvents.userId} AND f.user_id = ${activityEvents.friendId}))))
        OR (${activityEvents.kind} = 'set_complete'
          AND EXISTS (SELECT 1 FROM set_places sp WHERE sp.set_id = ${activityEvents.setId})
          AND NOT EXISTS (
            SELECT 1 FROM set_places sp JOIN places p ON p.id = sp.place_id
            WHERE sp.set_id = ${activityEvents.setId} AND (
              NOT ${visibleTo(viewerId, sql`p.owner_id`, sql`p.visibility`)}
              OR NOT EXISTS (SELECT 1 FROM editions e WHERE e.place_id = sp.place_id
                AND e.user_id = ${activityEvents.userId} AND e.visibility <> 'private')
            )
          ))
      )`,
      ),
    )
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(limit);
}

export async function getFeed(viewerId: string, query: FeedQuery): Promise<FeedDto> {
  let cursor = query.cursor ? decodeFeedCursor(query.cursor) : null;
  const batchSize = Math.max(64, query.limit + 1);
  const actors = db
    .select({
      id: sql<string>`CASE WHEN ${friendships.userId} = ${viewerId}::uuid THEN ${friendships.friendId} ELSE ${friendships.userId} END`,
    })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(eq(friendships.userId, viewerId), eq(friendships.friendId, viewerId)),
      ),
    );
  const rows: Awaited<ReturnType<typeof visibleEvents>> = [];
  while (rows.length <= query.limit) {
    const candidates = await db
      .select({ id: activityEvents.id, timestamp: eventTimestamp })
      .from(activityEvents)
      .where(
        and(
          inArray(activityEvents.userId, actors),
          sql`${activityEvents.visibility} <> 'private'`,
          cursor
            ? sql`(${activityEvents.createdAt}, ${activityEvents.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
      .limit(batchSize);
    if (!candidates.length) break;
    rows.push(
      ...(await visibleEvents(
        viewerId,
        candidates.map((candidate) => candidate.id),
        query.limit + 1 - rows.length,
      )),
    );
    if (candidates.length < batchSize) break;
    const last = candidates[candidates.length - 1];
    cursor = { id: last.id, createdAt: last.timestamp };
  }
  const page = rows.slice(0, query.limit);
  const events: ActivityEventDto[] = [];
  for (const row of page) {
    const base = {
      id: row.event.id,
      user: serializeSocialProfileDto(row.actor),
      createdAt: row.timestamp,
    };
    if (row.event.kind === "edition" && row.edition && row.place) {
      events.push({
        ...base,
        kind: "edition",
        edition: serializeSocialEditionDto(row.edition),
        place: socialPlaceDto(row.place),
      });
    } else if (row.event.kind === "ranking" && row.ranking && row.place) {
      events.push({
        ...base,
        kind: "ranking",
        sentiment: row.ranking.sentiment,
        place: socialPlaceDto(row.place),
      });
    } else if (row.event.kind === "note" && row.note && row.place) {
      events.push({
        ...base,
        kind: "note",
        place: socialPlaceDto(row.place),
        note: {
          id: row.note.id,
          placeId: row.note.placeId,
          userId: row.note.userId,
          kind: row.note.kind,
          body: row.note.body,
          visibility: row.note.visibility,
          createdAt: row.note.createdAt.toISOString(),
          updatedAt: row.note.updatedAt.toISOString(),
        },
      });
    } else if (row.event.kind === "friend" && row.friend) {
      events.push({ ...base, kind: "friend", friend: serializeSocialProfileDto(row.friend) });
    } else if (row.event.kind === "set_complete") {
      const completion = (await getSetCompletion(viewerId, row.event.userId)).find(
        (set) => set.setId === row.event.setId,
      );
      if (completion && completion.visited === completion.total)
        events.push({ ...base, kind: "set_complete", completion });
    }
  }
  const last = page.at(-1);
  return {
    events,
    nextCursor:
      rows.length > query.limit && last
        ? encodeFeedCursor({ id: last.event.id, createdAt: last.timestamp })
        : null,
  };
}
