import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { activityEvents, editions, placeNotes, places, rankings, users } from "@/lib/db/schema";
import { decodeFeedCursor, encodeFeedCursor } from "@/lib/contracts/api";
import { serializeSocialEditionDto, serializeSocialProfileDto } from "@/lib/contracts/serializers";
import type { ActivityEventDto, FeedDto, FeedQuery } from "../../../shared/api-contract";
import { acceptedFriends, visiblePlace, visibleTo } from "./social-access";
import { getSetCompletion } from "./stats";
import { socialPlaceDto } from "./social";

export async function getFeed(viewerId: string, query: FeedQuery): Promise<FeedDto> {
  const cursor = query.cursor ? decodeFeedCursor(query.cursor) : null;
  const friend = alias(users, "friend_profile");
  const rows = await db
    .select({
      event: activityEvents,
      actor: users,
      place: places,
      edition: editions,
      ranking: rankings,
      note: placeNotes,
      friend,
      timestamp: sql<string>`to_char(${activityEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
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
        acceptedFriends(viewerId, sql`${activityEvents.userId}`),
        sql`${activityEvents.visibility} <> 'private'`,
        cursor
          ? sql`(${activityEvents.createdAt}, ${activityEvents.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
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
    .limit(query.limit + 1);
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
