import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiRequests, editionCounters, editions, places } from "@/lib/db/schema";
import { deleteCapturePhoto, signCapturePhoto, verifyCapturePhoto } from "@/lib/auth/storage";
import { serializeCollectionEntryDto, serializeEditionDto } from "@/lib/serializers";
import type {
  AuthContext,
  CollectionEntryDto,
  EditionCreate,
  EditionDto,
  EditionPatch,
  SignedPhotoDto,
} from "../../../shared/api-contract";
import { requireSocialPlaces } from "./social-access";
import { afterEditionChange, syncEditionActivity } from "./activity";
import { ApiError, notFound } from "./errors";
import { validateEditionOuting } from "./plans";
import { removePlaceRanking } from "./rankings";
import {
  completeRequest,
  deletedResource,
  lockUser,
  reserveRequest,
  type Created,
  type Database,
} from "./transactions";

export async function getCollection(
  auth: AuthContext,
  database: Database = db,
): Promise<CollectionEntryDto[]> {
  const rows = await database
    .select({ edition: editions, place: places })
    .from(editions)
    .innerJoin(places, eq(editions.placeId, places.id))
    .where(eq(editions.userId, auth.userId))
    .orderBy(desc(editions.capturedAt), desc(editions.id));
  return Promise.all(rows.map((row) => serializeCollectionEntryDto(auth, row)));
}

export async function getEdition(auth: AuthContext, id: string): Promise<CollectionEntryDto> {
  const [row] = await db
    .select({ edition: editions, place: places })
    .from(editions)
    .innerJoin(places, eq(editions.placeId, places.id))
    .where(and(eq(editions.id, id), eq(editions.userId, auth.userId)));
  if (!row) notFound("This edition is unavailable.");
  return serializeCollectionEntryDto(auth, row);
}

export async function getEditionPhoto(auth: AuthContext, id: string): Promise<SignedPhotoDto> {
  const [row] = await db
    .select({ path: editions.photoPath })
    .from(editions)
    .where(and(eq(editions.id, id), eq(editions.userId, auth.userId)));
  if (!row?.path) notFound("This photo is unavailable.");
  return signCapturePhoto(auth, row.path);
}

export function normalizeEdition(input: EditionCreate) {
  return {
    requestId: input.requestId,
    placeId: input.placeId,
    capturedAt: new Date(input.capturedAt).toISOString(),
    timezone: input.timezone,
    note: input.note ?? null,
    companions: input.companions ?? [],
    variant: input.variant ?? "standard",
    photoPath: input.photoPath ?? null,
    origin: input.origin ?? "capture",
    importSourceId: input.importSourceId ?? null,
    outingId: input.outingId ?? null,
    visibility: input.visibility,
  };
}

export async function createEdition(
  auth: AuthContext,
  input: EditionCreate,
): Promise<Created<EditionDto>> {
  const normalized = normalizeEdition(input);
  const result = await db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    if (normalized.importSourceId) {
      const [imported] = await tx
        .select()
        .from(apiRequests)
        .where(
          and(
            eq(apiRequests.userId, auth.userId),
            eq(apiRequests.importSourceId, normalized.importSourceId),
          ),
        );
      if (imported && imported.requestId !== input.requestId) {
        const [existing] = imported.resourceId
          ? await tx
              .select({ id: editions.id })
              .from(editions)
              .where(and(eq(editions.id, imported.resourceId), eq(editions.userId, auth.userId)))
          : [];
        if (!existing) deletedResource();
        throw new ApiError(
          409,
          "idempotency_conflict",
          "This import is already saved. Open the existing visit.",
        );
      }
    }
    const request = await reserveRequest(
      tx,
      auth.userId,
      input.requestId,
      "edition.create",
      normalized,
      normalized.importSourceId,
    );
    if (request.resourceId) {
      const [row] = await tx
        .select()
        .from(editions)
        .where(and(eq(editions.id, request.resourceId), eq(editions.userId, auth.userId)));
      if (!row) deletedResource();
      return { row, created: false };
    }
    await requireSocialPlaces(auth.userId, [input.placeId], tx);
    if (normalized.outingId)
      await validateEditionOuting(tx, auth.userId, normalized.outingId, input.placeId);
    if (normalized.photoPath) await verifyCapturePhoto(auth, input.requestId, normalized.photoPath);
    const [counter] = await tx
      .insert(editionCounters)
      .values({
        userId: auth.userId,
        placeId: input.placeId,
        lastSequence: 1,
      })
      .onConflictDoUpdate({
        target: [editionCounters.userId, editionCounters.placeId],
        set: { lastSequence: sql`${editionCounters.lastSequence} + 1` },
      })
      .returning();
    const [row] = await tx
      .insert(editions)
      .values({
        ...normalized,
        userId: auth.userId,
        capturedAt: new Date(normalized.capturedAt),
        visibility: normalized.visibility ?? "private",
        visitSequence: counter.lastSequence,
      })
      .returning();
    await completeRequest(tx, auth.userId, input.requestId, row.id, row.photoPath);
    await syncEditionActivity(tx, auth.userId, row.id);
    await afterEditionChange(tx, auth.userId, row.placeId);
    return { row, created: true };
  });
  return { data: await serializeEditionDto(auth, result.row), created: result.created };
}

export async function updateEdition(
  auth: AuthContext,
  id: string,
  input: EditionPatch,
): Promise<EditionDto> {
  const row = await db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const [updated] = await tx
      .update(editions)
      .set({
        ...input,
        capturedAt: input.capturedAt === undefined ? undefined : new Date(input.capturedAt),
      })
      .where(and(eq(editions.id, id), eq(editions.userId, auth.userId)))
      .returning();
    if (!updated) notFound("This edition is unavailable.");
    await syncEditionActivity(tx, auth.userId, updated.id);
    await afterEditionChange(tx, auth.userId, updated.placeId);
    return updated;
  });
  return serializeEditionDto(auth, row);
}

export async function deleteEdition(auth: AuthContext, id: string): Promise<{ deleted: true }> {
  const path = await db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const [row] = await tx
      .delete(editions)
      .where(and(eq(editions.id, id), eq(editions.userId, auth.userId)))
      .returning();
    if (!row) {
      const [request] = await tx
        .select()
        .from(apiRequests)
        .where(
          and(
            eq(apiRequests.userId, auth.userId),
            eq(apiRequests.resourceId, id),
            eq(apiRequests.operation, "edition.create"),
          ),
        );
      if (!request) notFound("This edition is unavailable.");
      return request.resourcePath;
    }
    const [remaining] = await tx
      .select({ id: editions.id })
      .from(editions)
      .where(and(eq(editions.userId, auth.userId), eq(editions.placeId, row.placeId)))
      .limit(1);
    if (!remaining) await removePlaceRanking(tx, auth.userId, row.placeId);
    await afterEditionChange(tx, auth.userId, row.placeId);
    return row.photoPath;
  });
  if (path) await deleteCapturePhoto(auth, path);
  return { deleted: true };
}
