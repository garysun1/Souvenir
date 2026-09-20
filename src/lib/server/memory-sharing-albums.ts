import "server-only";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { importBatches, memoryMoments, tripAlbums, tripAlbumMembers } from "@/lib/db/schema";
import type {
  AlbumInvitationDto,
  AlbumMemberDto,
  AlbumMemberInvite,
  InvitationRespond,
  MemoryDeletedDto,
  MemoryMutation,
  MemoryPageQuery,
  TripAlbumCreate,
  TripAlbumDto,
  TripAlbumPatch,
} from "../../../shared/memories-contract";
import { ApiError, notFound } from "./errors";
import {
  albumAccess,
  albumDto,
  lockAlbum,
  memberDto,
  memoryPage,
  requireAlbum,
  requireMemoryFriend,
  requireMemoryVersion,
} from "./memory-sharing-access";
import { requirePlan } from "./plans";
import { completeRequest, lockUser, reserveRequest, type Created } from "./transactions";

export async function createMemoryAlbum(
  userId: string,
  input: TripAlbumCreate,
): Promise<Created<TripAlbumDto>> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const request = await reserveRequest(tx, userId, input.requestId, "memory.album.create", input);
    if (request.resourceId) {
      await requireAlbum(userId, request.resourceId, tx, true);
      return { data: JSON.parse(request.resourcePath!) as TripAlbumDto, created: false };
    }
    if (input.outingId) await requirePlan(tx, userId, input.outingId);
    if (input.sourceBatchId) {
      const [batch] = await tx
        .select({ id: importBatches.id })
        .from(importBatches)
        .where(and(eq(importBatches.id, input.sourceBatchId), eq(importBatches.ownerId, userId)));
      if (!batch) notFound();
    }
    const [row] = await tx
      .insert(tripAlbums)
      .values({ ...input, ownerId: userId })
      .returning();
    const data = albumDto(row, userId);
    await completeRequest(tx, userId, input.requestId, row.id, JSON.stringify(data));
    return { data, created: true };
  });
}

export async function getMemoryAlbums(userId: string, query: MemoryPageQuery) {
  const rows = await db
    .select()
    .from(tripAlbums)
    .where(
      and(
        albumAccess(userId, sql`${tripAlbums.id}`),
        query.cursor ? gt(tripAlbums.id, query.cursor) : undefined,
      ),
    )
    .orderBy(asc(tripAlbums.id))
    .limit(query.limit + 1);
  return memoryPage(
    rows.map((row) => albumDto(row, userId)),
    query.limit,
    (row) => row.id,
  );
}

export async function getMemoryAlbum(userId: string, id: string) {
  return albumDto(await requireAlbum(userId, id), userId);
}

export async function updateMemoryAlbum(userId: string, id: string, input: TripAlbumPatch) {
  return db.transaction(async (tx) => {
    await lockAlbum(tx, id);
    const row = await requireAlbum(userId, id, tx, true);
    requireMemoryVersion(row.version, input.expectedVersion);
    const [updated] = await tx
      .update(tripAlbums)
      .set({
        title: input.title,
        description: input.description,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(tripAlbums.id, id), eq(tripAlbums.version, input.expectedVersion)))
      .returning();
    return albumDto(updated, userId);
  });
}

export async function deleteMemoryAlbum(
  userId: string,
  id: string,
  input: MemoryMutation,
): Promise<MemoryDeletedDto> {
  return db.transaction(async (tx) => {
    await lockAlbum(tx, id);
    const row = await requireAlbum(userId, id, tx, true);
    requireMemoryVersion(row.version, input.expectedVersion);
    await tx
      .update(memoryMoments)
      .set({ albumId: null, version: sql`${memoryMoments.version} + 1`, updatedAt: new Date() })
      .where(eq(memoryMoments.albumId, id));
    await tx.delete(tripAlbums).where(eq(tripAlbums.id, id));
    return { deleted: true };
  });
}

export async function getMemoryAlbumMembers(userId: string, id: string, query: MemoryPageQuery) {
  await requireAlbum(userId, id);
  const rows = await db
    .select()
    .from(tripAlbumMembers)
    .where(
      and(
        eq(tripAlbumMembers.albumId, id),
        albumAccess(userId, sql`${tripAlbumMembers.albumId}`),
        query.cursor ? gt(tripAlbumMembers.id, query.cursor) : undefined,
      ),
    )
    .orderBy(asc(tripAlbumMembers.id))
    .limit(query.limit + 1);
  return memoryPage(rows.map(memberDto), query.limit, (row) => row.id);
}

export async function inviteMemoryAlbumMember(
  userId: string,
  albumId: string,
  input: AlbumMemberInvite,
): Promise<Created<AlbumMemberDto>> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const request = await reserveRequest(tx, userId, input.requestId, "memory.member.invite", {
      albumId,
      ...input,
    });
    await lockAlbum(tx, albumId);
    await requireAlbum(userId, albumId, tx, true);
    if (request.resourceId) {
      return { data: JSON.parse(request.resourcePath!) as AlbumMemberDto, created: false };
    }
    await requireMemoryFriend(tx, userId, input.userId);
    const [existing] = await tx
      .select()
      .from(tripAlbumMembers)
      .where(and(eq(tripAlbumMembers.albumId, albumId), eq(tripAlbumMembers.userId, input.userId)));
    if (existing && (existing.state === "pending" || existing.state === "accepted")) {
      const data = memberDto(existing);
      await completeRequest(tx, userId, input.requestId, existing.id, JSON.stringify(data));
      return { data, created: false };
    }
    const [row] = existing
      ? await tx
          .update(tripAlbumMembers)
          .set({
            state: "pending",
            requestId: input.requestId,
            version: existing.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(tripAlbumMembers.id, existing.id))
          .returning()
      : await tx
          .insert(tripAlbumMembers)
          .values({ albumId, userId: input.userId, invitedBy: userId, requestId: input.requestId })
          .returning();
    const data = memberDto(row);
    await completeRequest(tx, userId, input.requestId, row.id, JSON.stringify(data));
    return { data, created: true };
  });
}

export async function respondMemoryAlbumMember(
  userId: string,
  albumId: string,
  memberId: string,
  input: InvitationRespond,
) {
  return db.transaction(async (tx) => {
    const album = await lockAlbum(tx, albumId);
    const [row] = await tx
      .select()
      .from(tripAlbumMembers)
      .where(and(eq(tripAlbumMembers.id, memberId), eq(tripAlbumMembers.albumId, albumId)))
      .for("update");
    if (!row || (row.userId !== userId && album.ownerId !== userId)) notFound();
    if (row.userId !== userId && input.state !== "removed") notFound();
    requireMemoryVersion(row.version, input.expectedVersion);
    if (
      (input.state !== "removed" && row.state !== "pending") ||
      (input.state === "removed" && row.state !== "pending" && row.state !== "accepted")
    ) {
      throw new ApiError(409, "conflict", "This invitation is no longer pending or active.");
    }
    const [updated] = await tx
      .update(tripAlbumMembers)
      .set({ state: input.state, version: row.version + 1, updatedAt: new Date() })
      .where(and(eq(tripAlbumMembers.id, memberId), eq(tripAlbumMembers.version, row.version)))
      .returning();
    return memberDto(updated);
  });
}

export async function getMemoryAlbumInvitations(userId: string, query: MemoryPageQuery) {
  const rows = await db
    .select({
      membership: tripAlbumMembers,
      albumTitle: tripAlbums.title,
      ownerId: tripAlbums.ownerId,
    })
    .from(tripAlbumMembers)
    .innerJoin(tripAlbums, eq(tripAlbums.id, tripAlbumMembers.albumId))
    .where(
      and(
        eq(tripAlbumMembers.userId, userId),
        eq(tripAlbumMembers.state, "pending"),
        query.cursor ? gt(tripAlbumMembers.id, query.cursor) : undefined,
      ),
    )
    .orderBy(asc(tripAlbumMembers.id))
    .limit(query.limit + 1);
  const items: AlbumInvitationDto[] = rows.map((row) => ({
    ...row,
    membership: memberDto(row.membership),
  }));
  return memoryPage(items, query.limit, (row) => row.membership.id);
}
