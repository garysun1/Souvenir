import "server-only";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { memoryMoments, tripAlbums, users } from "@/lib/db/schema";
import type {
  AlbumMemberDto,
  MemoryMomentDto,
  MemoryPageDto,
  MomentTagDto,
  TripAlbumDto,
} from "../../../shared/memories-contract";
import type { tripAlbumMembers, momentPersonTags } from "@/lib/db/schema";
import { ApiError, notFound } from "./errors";
import { acceptedFriends } from "./social-access";
import type { Database, Transaction } from "./transactions";

export function albumAccess(userId: string, album: SQL): SQL {
  return sql`EXISTS (SELECT 1 FROM trip_albums a WHERE a.id = ${album}
    AND (a.owner_id = ${userId}::uuid OR EXISTS (
      SELECT 1 FROM trip_album_members m WHERE m.album_id = a.id
      AND m.user_id = ${userId}::uuid AND m.state = 'accepted')))`;
}

export function activeAlbumAuthor(): SQL {
  return sql`EXISTS (SELECT 1 FROM trip_albums a WHERE a.id = ${memoryMoments.albumId}
    AND (a.owner_id = ${memoryMoments.authorId} OR EXISTS (
      SELECT 1 FROM trip_album_members m WHERE m.album_id = a.id
      AND m.user_id = ${memoryMoments.authorId} AND m.state = 'accepted')))`;
}

export function availableMomentSource(): SQL {
  return sql`(EXISTS (SELECT 1 FROM editions e
      WHERE e.id = ${memoryMoments.sourceEditionId} AND e.user_id = ${memoryMoments.authorId})
    OR EXISTS (SELECT 1 FROM import_items i JOIN import_batches b ON b.id = i.batch_id
      WHERE i.id = ${memoryMoments.sourceImportItemId}
      AND i.owner_id = ${memoryMoments.authorId} AND b.owner_id = i.owner_id
      AND b.state <> 'cancelled' AND i.state IN ('uploaded', 'ready', 'committed')
      AND i.photo_path IS NOT NULL))`;
}

export function momentAccess(userId: string): SQL {
  return sql`(${memoryMoments.authorId} = ${userId}::uuid
    OR (${albumAccess(userId, sql`${memoryMoments.albumId}`)} AND ${activeAlbumAuthor()})
    OR (${acceptedFriends(userId, sql`${memoryMoments.authorId}`)} AND (
      EXISTS (SELECT 1 FROM moment_person_tags t WHERE t.moment_id = ${memoryMoments.id}
        AND t.sender_id = ${memoryMoments.authorId} AND t.user_id = ${userId}::uuid
        AND t.state IN ('pending', 'accepted'))
      OR EXISTS (SELECT 1 FROM taste_profiles p WHERE p.user_id = ${memoryMoments.authorId}
        AND p.sharing = 'friends'
        AND p.published->'collageMomentIds' @> jsonb_build_array(${memoryMoments.id}::text))
    )))`;
}

export async function requireAlbum(
  userId: string,
  id: string,
  database: Database = db,
  ownerOnly = false,
) {
  const [row] = await database
    .select()
    .from(tripAlbums)
    .where(
      and(
        eq(tripAlbums.id, id),
        ownerOnly ? eq(tripAlbums.ownerId, userId) : albumAccess(userId, sql`${tripAlbums.id}`),
      ),
    );
  if (!row) notFound();
  return row;
}

export async function lockAlbum(tx: Transaction, id: string) {
  const [row] = await tx.select().from(tripAlbums).where(eq(tripAlbums.id, id)).for("update");
  if (!row) notFound();
  return row;
}

export async function requireMoment(
  userId: string,
  id: string,
  database: Database = db,
  authorOnly = false,
) {
  const [row] = await database
    .select()
    .from(memoryMoments)
    .where(
      and(
        eq(memoryMoments.id, id),
        isNull(memoryMoments.withdrawnAt),
        availableMomentSource(),
        authorOnly ? eq(memoryMoments.authorId, userId) : momentAccess(userId),
      ),
    );
  if (!row) notFound();
  return row;
}

export async function requireMemoryFriend(tx: Transaction, userId: string, friendId: string) {
  if (friendId === userId) notFound();
  const [friend] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, friendId), acceptedFriends(userId, sql`${users.id}`)));
  if (!friend) notFound();
}

export function requireMemoryVersion(actual: number, expected: number) {
  if (actual !== expected) {
    throw new ApiError(409, "conflict", "This memory changed. Refresh before trying again.");
  }
}

export function memoryPage<T>(rows: T[], limit: number, id: (row: T) => string): MemoryPageDto<T> {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? id(items[items.length - 1]) : null };
}

export function albumDto(row: typeof tripAlbums.$inferSelect, userId: string): TripAlbumDto {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    description: row.description,
    outingId: row.outingId,
    sourceBatchId: row.sourceBatchId,
    role: row.ownerId === userId ? "owner" : "contributor",
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function momentDto(row: typeof memoryMoments.$inferSelect): MemoryMomentDto {
  const source = row.sourceEditionId
    ? { kind: "edition" as const, id: row.sourceEditionId }
    : { kind: "import_item" as const, id: row.sourceImportItemId! };
  return {
    id: row.id,
    authorId: row.authorId,
    albumId: row.albumId,
    source,
    confirmedStop:
      row.placeId && row.capturedAt && row.timezone
        ? {
            placeId: row.placeId,
            capturedAt: row.capturedAt.toISOString(),
            timezone: row.timezone,
          }
        : null,
    groupKey: row.groupKey,
    note: row.note,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function memberDto(row: typeof tripAlbumMembers.$inferSelect): AlbumMemberDto {
  return {
    id: row.id,
    albumId: row.albumId,
    userId: row.userId,
    invitedBy: row.invitedBy,
    state: row.state,
    role: row.role,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function tagDto(row: typeof momentPersonTags.$inferSelect): MomentTagDto {
  return {
    id: row.id,
    momentId: row.momentId,
    senderId: row.senderId,
    userId: row.userId,
    state: row.state,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
