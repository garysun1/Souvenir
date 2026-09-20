import { createHash } from "node:crypto";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { activityEvents, editions, placeNotes, rankings } from "@/lib/db/schema";
import { recomputeStats, type Locality } from "./stats";
import { visibleTo } from "./social-access";
import type { Transaction } from "./transactions";

function eventKey(userId: string, kind: string, target: string): string {
  const hash = createHash("sha256").update(`${userId}:${kind}:${target}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function syncEditionActivity(
  tx: Transaction,
  userId: string,
  editionId: string,
): Promise<void> {
  const [row] = await tx
    .select()
    .from(editions)
    .where(and(eq(editions.id, editionId), eq(editions.userId, userId)));
  if (!row) return;
  await tx
    .insert(activityEvents)
    .values({
      userId,
      kind: "edition",
      placeId: row.placeId,
      editionId: row.id,
      requestId: row.requestId,
      visibility: row.visibility,
      createdAt: row.createdAt,
    })
    .onConflictDoUpdate({ target: activityEvents.editionId, set: { visibility: row.visibility } });
}

export async function syncRankingActivity(
  tx: Transaction,
  userId: string,
  placeId: string,
): Promise<void> {
  const [row] = await tx
    .select()
    .from(rankings)
    .where(and(eq(rankings.userId, userId), eq(rankings.placeId, placeId)));
  if (!row) return;
  await tx
    .insert(activityEvents)
    .values({
      userId,
      kind: "ranking",
      placeId,
      rankingPlaceId: placeId,
      requestId: eventKey(userId, "ranking", placeId),
      visibility: row.visibility,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [activityEvents.userId, activityEvents.requestId, activityEvents.kind],
      set: { visibility: row.visibility },
    });
}

export async function syncNoteActivity(
  tx: Transaction,
  userId: string,
  noteId: string,
): Promise<void> {
  const [row] = await tx
    .select()
    .from(placeNotes)
    .where(and(eq(placeNotes.userId, userId), eq(placeNotes.id, noteId)));
  if (!row) return;
  await tx
    .insert(activityEvents)
    .values({
      userId,
      kind: "note",
      noteId,
      placeId: row.placeId,
      requestId: row.requestId,
      visibility: row.visibility,
      createdAt: row.createdAt,
    })
    .onConflictDoUpdate({ target: activityEvents.noteId, set: { visibility: row.visibility } });
}

export async function syncSetActivity(tx: Transaction, userId: string): Promise<void> {
  const completed = await tx.execute<{ id: string }>(sql`
    SELECT s.id FROM sets s WHERE EXISTS (SELECT 1 FROM set_places sp WHERE sp.set_id = s.id)
    AND NOT EXISTS (
      SELECT 1 FROM set_places sp JOIN places p ON p.id = sp.place_id WHERE sp.set_id = s.id
      AND (NOT ${visibleTo(userId, sql`p.owner_id`, sql`p.visibility`)} OR NOT EXISTS (
        SELECT 1 FROM editions e WHERE e.place_id = sp.place_id AND e.user_id = ${userId}::uuid AND e.visibility <> 'private'
      ))
    ) ORDER BY s.id
  `);
  const ids = completed.map((row) => row.id);
  await tx
    .delete(activityEvents)
    .where(
      and(
        eq(activityEvents.userId, userId),
        eq(activityEvents.kind, "set_complete"),
        ids.length ? notInArray(activityEvents.setId, ids) : undefined,
      ),
    );
  for (const setId of ids) {
    await tx
      .insert(activityEvents)
      .values({
        userId,
        kind: "set_complete",
        setId,
        visibility: "friends",
        requestId: eventKey(userId, "set_complete", setId),
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }
}

export async function syncFriendActivity(tx: Transaction, a: string, b: string): Promise<void> {
  for (const [userId, friendId] of [
    [a, b],
    [b, a],
  ]) {
    await tx
      .insert(activityEvents)
      .values({
        userId,
        kind: "friend",
        friendId,
        visibility: "friends",
        requestId: eventKey(userId, "friend", friendId),
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }
}

export async function afterEditionChange(
  tx: Transaction,
  userId: string,
  placeId: string,
): Promise<void> {
  await recomputeStats({ placeIds: [placeId], userIds: [userId] }, tx);
  await syncSetActivity(tx, userId);
}

export async function afterPlaceChange(
  tx: Transaction,
  placeId: string,
  previousLocality?: Locality,
): Promise<void> {
  const owners = await tx.execute<{ id: string }>(
    sql`SELECT DISTINCT user_id AS id FROM editions WHERE place_id = ${placeId}::uuid ORDER BY user_id`,
  );
  await recomputeStats(
    {
      placeIds: [placeId],
      userIds: owners.map((row) => row.id),
      previousLocalities: previousLocality ? [previousLocality] : [],
    },
    tx,
  );
  for (const { id } of owners) await syncSetActivity(tx, id);
}
