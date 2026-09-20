import "server-only";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { editions, importBatches, importItems, memoryMoments } from "@/lib/db/schema";
import type {
  ConfirmedMemoryStop,
  MemoryDeletedDto,
  MemoryMediaSource,
  MemoryMomentCreate,
  MemoryMomentDto,
  MemoryMomentPatch,
  MemoryMutation,
  MemoryPageQuery,
} from "../../../shared/memories-contract";
import { ApiError, invalidRequest, notFound } from "./errors";
import {
  activeAlbumAuthor,
  albumAccess,
  availableMomentSource,
  lockAlbum,
  memoryPage,
  momentDto,
  requireAlbum,
  requireMemoryVersion,
  requireMoment,
} from "./memory-sharing-access";
import { requireSocialPlace } from "./social-access";
import {
  completeRequest,
  lockUser,
  reserveRequest,
  type Created,
  type Transaction,
} from "./transactions";

async function sourceStop(
  tx: Transaction,
  userId: string,
  source: MemoryMediaSource,
  supplied: ConfirmedMemoryStop | null | undefined,
): Promise<ConfirmedMemoryStop | null> {
  if (source.kind === "edition") {
    const [row] = await tx
      .select()
      .from(editions)
      .where(and(eq(editions.id, source.id), eq(editions.userId, userId)))
      .for("share");
    if (!row) notFound();
    const stop = {
      placeId: row.placeId,
      capturedAt: row.capturedAt.toISOString(),
      timezone: row.timezone,
    };
    if (
      supplied !== undefined &&
      (!supplied ||
        supplied.placeId !== stop.placeId ||
        new Date(supplied.capturedAt).toISOString() !== stop.capturedAt ||
        supplied.timezone !== stop.timezone)
    ) {
      invalidRequest("The confirmed stop must match the source visit.");
    }
    return stop;
  }
  const [row] = await tx
    .select()
    .from(importItems)
    .where(and(eq(importItems.id, source.id), eq(importItems.ownerId, userId)))
    .for("share");
  if (!row || !row.photoPath || !["uploaded", "ready", "committed"].includes(row.state)) notFound();
  const [batch] = await tx
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, row.batchId), eq(importBatches.ownerId, userId)));
  if (!batch || batch.state === "cancelled") notFound();
  const stop = supplied === undefined ? row.confirmedStop : supplied;
  if (stop) await requireSocialPlace(userId, stop.placeId, tx);
  return stop;
}

function stopColumns(stop: ConfirmedMemoryStop | null) {
  return {
    placeId: stop?.placeId ?? null,
    capturedAt: stop ? new Date(stop.capturedAt) : null,
    timezone: stop?.timezone ?? null,
  };
}

export async function createMemoryMoment(
  userId: string,
  input: MemoryMomentCreate,
): Promise<Created<MemoryMomentDto>> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const request = await reserveRequest(
      tx,
      userId,
      input.requestId,
      "memory.moment.create",
      input,
    );
    if (request.resourceId) {
      await requireMoment(userId, request.resourceId, tx, true);
      return { data: JSON.parse(request.resourcePath!) as MemoryMomentDto, created: false };
    }
    const albumId = input.target.kind === "album" ? input.target.albumId : null;
    if (albumId) {
      await lockAlbum(tx, albumId);
      await requireAlbum(userId, albumId, tx);
    }
    const stop = await sourceStop(tx, userId, input.source, input.confirmedStop);
    if (input.source.kind === "import_item") {
      const [existing] = await tx
        .select({ id: memoryMoments.id })
        .from(memoryMoments)
        .where(eq(memoryMoments.sourceImportItemId, input.source.id));
      if (existing) throw new ApiError(409, "conflict", "This import already has a moment.");
    }
    const [row] = await tx
      .insert(memoryMoments)
      .values({
        authorId: userId,
        requestId: input.requestId,
        albumId,
        sourceEditionId: input.source.kind === "edition" ? input.source.id : null,
        sourceImportItemId: input.source.kind === "import_item" ? input.source.id : null,
        ...stopColumns(stop),
        groupKey: input.groupKey,
        note: input.note,
      })
      .returning();
    const data = momentDto(row);
    await completeRequest(tx, userId, input.requestId, row.id, JSON.stringify(data));
    return { data, created: true };
  });
}

export async function getMemoryMoment(userId: string, id: string) {
  return momentDto(await requireMoment(userId, id));
}

export async function getMemoryMoments(userId: string, query: MemoryPageQuery) {
  const rows = await db
    .select()
    .from(memoryMoments)
    .where(
      and(
        eq(memoryMoments.authorId, userId),
        isNull(memoryMoments.withdrawnAt),
        availableMomentSource(),
        query.cursor ? gt(memoryMoments.id, query.cursor) : undefined,
      ),
    )
    .orderBy(asc(memoryMoments.id))
    .limit(query.limit + 1);
  return memoryPage(rows.map(momentDto), query.limit, (row) => row.id);
}

export async function getMemoryAlbumMoments(
  userId: string,
  albumId: string,
  query: MemoryPageQuery,
) {
  await requireAlbum(userId, albumId);
  const rows = await db
    .select()
    .from(memoryMoments)
    .where(
      and(
        eq(memoryMoments.albumId, albumId),
        isNull(memoryMoments.withdrawnAt),
        availableMomentSource(),
        albumAccess(userId, sql`${memoryMoments.albumId}`),
        activeAlbumAuthor(),
        query.cursor ? gt(memoryMoments.id, query.cursor) : undefined,
      ),
    )
    .orderBy(asc(memoryMoments.id))
    .limit(query.limit + 1);
  return memoryPage(rows.map(momentDto), query.limit, (row) => row.id);
}

export async function updateMemoryMoment(userId: string, id: string, input: MemoryMomentPatch) {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await tx
      .select({ id: memoryMoments.id })
      .from(memoryMoments)
      .where(and(eq(memoryMoments.id, id), eq(memoryMoments.authorId, userId)))
      .for("update");
    const row = await requireMoment(userId, id, tx, true);
    requireMemoryVersion(row.version, input.expectedVersion);
    const stop =
      input.confirmedStop !== undefined
        ? await sourceStop(tx, userId, momentDto(row).source, input.confirmedStop)
        : undefined;
    const [updated] = await tx
      .update(memoryMoments)
      .set({
        note: input.note,
        groupKey: input.groupKey,
        ...(stop === undefined ? {} : stopColumns(stop)),
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(memoryMoments.id, id), eq(memoryMoments.version, row.version)))
      .returning();
    return momentDto(updated);
  });
}

export async function deleteMemoryMoment(
  userId: string,
  id: string,
  input: MemoryMutation,
): Promise<MemoryDeletedDto> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await tx
      .select({ id: memoryMoments.id })
      .from(memoryMoments)
      .where(and(eq(memoryMoments.id, id), eq(memoryMoments.authorId, userId)))
      .for("update");
    const row = await requireMoment(userId, id, tx, true);
    requireMemoryVersion(row.version, input.expectedVersion);
    await tx
      .update(memoryMoments)
      .set({ withdrawnAt: new Date(), updatedAt: new Date(), version: row.version + 1 })
      .where(and(eq(memoryMoments.id, id), eq(memoryMoments.version, row.version)));
    return { deleted: true };
  });
}
