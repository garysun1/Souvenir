import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  apiRequests,
  editionCounters,
  editions,
  importBatches,
  importItems,
  memoryMoments,
  tasteEvidence,
  tasteProfiles,
  tripAlbums,
  tripAlbumMembers,
} from "@/lib/db/schema";
import { createCaptureUpload, signCapturePhoto } from "@/lib/auth/storage";
import { memoryAnalysisSchema } from "@/lib/contracts/memories";
import { tasteProvider, TasteProviderError } from "@/lib/ai/taste";
import { afterEditionChange, syncEditionActivity } from "./activity";
import { normalizeEdition } from "./editions";
import { ApiError, invalidRequest, notFound } from "./errors";
import { requireSocialPlaces } from "./social-access";
import {
  completeRequest,
  deletedResource,
  lockUser,
  reserveRequest,
  type Database,
  type Transaction,
} from "./transactions";
import { downloadImportBytes, inspectImportBytes } from "./memory-import-media";
import { cleanupMemoryPhotos } from "./memory-media-cleanup";
import type { AuthContext } from "../../../shared/api-contract";
import type {
  ImportAnalyzeRequest,
  ImportBatchCreate,
  ImportBatchDto,
  ImportCommitDto,
  ImportCommitRequest,
  ImportItemCreate,
  ImportItemDto,
  ImportItemPatch,
  ImportItemUploadDto,
  MemoryMomentDto,
  MemoryMutation,
  MemoryPageQuery,
} from "../../../shared/memories-contract";

type Batch = typeof importBatches.$inferSelect;
type Item = typeof importItems.$inferSelect;
const leaseMs = 120_000;
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export function checkMemoryVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new ApiError(409, "conflict", "This memory changed. Refresh before saving.");
}

export function serializeImportItem(row: Item): ImportItemDto {
  return {
    id: row.id,
    batchId: row.batchId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    state: row.state,
    metadata: row.metadata,
    analysis: row.analysis,
    groupKey: row.groupKey,
    confirmedStop: row.confirmedStop,
    duplicateOfItemId: row.duplicateOfItemId,
    editionId: row.editionId,
    error: row.error,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeImportMoment(row: typeof memoryMoments.$inferSelect): MemoryMomentDto {
  return {
    id: row.id,
    authorId: row.authorId,
    albumId: row.albumId,
    source: row.sourceImportItemId
      ? { kind: "import_item", id: row.sourceImportItemId }
      : { kind: "edition", id: row.sourceEditionId! },
    confirmedStop:
      row.placeId && row.capturedAt && row.timezone
        ? { placeId: row.placeId, capturedAt: row.capturedAt.toISOString(), timezone: row.timezone }
        : null,
    groupKey: row.groupKey,
    note: row.note,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ownedBatch(database: Database, ownerId: string, id: string): Promise<Batch> {
  const [row] = await database
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.id, id),
        eq(importBatches.ownerId, ownerId),
        ne(importBatches.state, "cancelled"),
      ),
    );
  if (!row) notFound();
  return row;
}

async function ownedItem(
  database: Database,
  ownerId: string,
  batchId: string,
  id: string,
): Promise<Item> {
  await ownedBatch(database, ownerId, batchId);
  const [row] = await database
    .select()
    .from(importItems)
    .where(
      and(
        eq(importItems.id, id),
        eq(importItems.ownerId, ownerId),
        eq(importItems.batchId, batchId),
      ),
    );
  if (!row) notFound();
  return row;
}

export async function getImportBatch(
  auth: AuthContext,
  id: string,
  database: Database = db,
): Promise<ImportBatchDto> {
  const batch = await ownedBatch(database, auth.userId, id);
  const items = await database
    .select()
    .from(importItems)
    .where(and(eq(importItems.batchId, id), eq(importItems.ownerId, auth.userId)))
    .orderBy(asc(importItems.id));
  return {
    id: batch.id,
    title: batch.title,
    state: batch.state,
    version: batch.version,
    items: items.map(serializeImportItem),
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  };
}

export async function listImportBatches(auth: AuthContext, query: MemoryPageQuery) {
  const rows = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.ownerId, auth.userId),
        ne(importBatches.state, "cancelled"),
        query.cursor ? gt(importBatches.id, query.cursor) : undefined,
      ),
    )
    .orderBy(asc(importBatches.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  return {
    items: await Promise.all(page.map((row) => getImportBatch(auth, row.id))),
    nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
  };
}

export async function createImportBatch(auth: AuthContext, input: ImportBatchCreate) {
  return db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const request = await reserveRequest(
      tx,
      auth.userId,
      input.requestId,
      "import.batch.create",
      input,
    );
    if (request.resourceId) {
      const [existing] = await tx
        .select()
        .from(importBatches)
        .where(eq(importBatches.id, request.resourceId));
      if (!existing) deletedResource();
      return getImportBatch(auth, existing.id, tx);
    }
    const [row] = await tx
      .insert(importBatches)
      .values({
        ownerId: auth.userId,
        requestId: input.requestId,
        title: input.title,
      })
      .returning();
    await completeRequest(tx, auth.userId, input.requestId, row.id);
    return getImportBatch(auth, row.id, tx);
  });
}

async function updateBatchState(tx: Transaction, ownerId: string, batchId: string) {
  const rows = await tx
    .select({ state: importItems.state })
    .from(importItems)
    .where(and(eq(importItems.batchId, batchId), eq(importItems.ownerId, ownerId)));
  const active = rows.filter((row) => row.state !== "duplicate");
  const state = active.some((row) => row.state === "processing")
    ? "processing"
    : active.length && active.every((row) => row.state === "committed")
      ? "committed"
      : active.length && active.every((row) => ["ready", "committed"].includes(row.state))
        ? "ready"
        : "open";
  await tx
    .update(importBatches)
    .set({ state, version: sql`${importBatches.version} + 1`, updatedAt: new Date() })
    .where(and(eq(importBatches.id, batchId), eq(importBatches.ownerId, ownerId)));
}

export async function registerImportItem(
  auth: AuthContext,
  batchId: string,
  input: ImportItemCreate,
): Promise<ImportItemUploadDto> {
  const item = await db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    await ownedBatch(tx, auth.userId, batchId);
    const request = await reserveRequest(tx, auth.userId, input.requestId, "import.item.create", {
      batchId,
      ...input,
    });
    if (request.resourceId) {
      const [existing] = await tx
        .select()
        .from(importItems)
        .where(and(eq(importItems.id, request.resourceId), eq(importItems.ownerId, auth.userId)));
      if (!existing) deletedResource();
      return existing;
    }
    const count = await tx
      .select({ id: importItems.id })
      .from(importItems)
      .where(eq(importItems.batchId, batchId));
    if (count.length >= 20) invalidRequest("A batch accepts at most 20 images.");
    const [duplicate] = await tx
      .select()
      .from(importItems)
      .where(
        and(
          eq(importItems.ownerId, auth.userId),
          eq(importItems.sha256, input.sha256),
          ne(importItems.state, "duplicate"),
        ),
      );
    const photoPath = duplicate
      ? null
      : `${auth.userId.toLowerCase()}/${input.requestId.toLowerCase()}.${extensions[input.contentType]}`;
    const [row] = await tx
      .insert(importItems)
      .values({
        ...input,
        batchId,
        ownerId: auth.userId,
        photoPath,
        duplicateOfItemId: duplicate?.id ?? null,
        state: duplicate ? "duplicate" : "pending_upload",
      })
      .returning();
    await completeRequest(tx, auth.userId, input.requestId, row.id, photoPath);
    await updateBatchState(tx, auth.userId, batchId);
    return row;
  });
  const upload =
    item.state === "pending_upload"
      ? await createCaptureUpload(auth, {
          requestId: item.requestId,
          contentType: item.contentType,
          size: item.sizeBytes,
        })
      : null;
  return { item: serializeImportItem(item), upload };
}

export async function completeImportItem(
  auth: AuthContext,
  batchId: string,
  itemId: string,
  input: MemoryMutation,
) {
  const item = await ownedItem(db, auth.userId, batchId, itemId);
  if (["uploaded", "ready", "processing", "failed", "committed"].includes(item.state))
    return serializeImportItem(item);
  checkMemoryVersion(item.version, input.expectedVersion);
  if (item.state !== "pending_upload" || !item.photoPath)
    invalidRequest("This item cannot be uploaded.");
  const metadata = await inspectImportBytes(await downloadImportBytes(auth, item.photoPath), item);
  return db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const current = await ownedItem(tx, auth.userId, batchId, itemId);
    if (["uploaded", "ready", "processing", "failed", "committed"].includes(current.state))
      return serializeImportItem(current);
    checkMemoryVersion(current.version, input.expectedVersion);
    const [updated] = await tx
      .update(importItems)
      .set({
        state: "uploaded",
        metadata: current.metadata.origin === "manual" ? current.metadata : metadata,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(importItems.id, itemId))
      .returning();
    await updateBatchState(tx, auth.userId, batchId);
    return serializeImportItem(updated);
  });
}

export async function patchImportItem(
  auth: AuthContext,
  batchId: string,
  itemId: string,
  input: ImportItemPatch,
) {
  return db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const item = await ownedItem(tx, auth.userId, batchId, itemId);
    checkMemoryVersion(item.version, input.expectedVersion);
    if (["duplicate", "committed"].includes(item.state))
      invalidRequest("Edit the saved moment instead.");
    if (input.confirmedStop)
      await requireSocialPlaces(auth.userId, [input.confirmedStop.placeId], tx);
    const [row] = await tx
      .update(importItems)
      .set({
        groupKey: input.groupKey,
        confirmedStop: input.confirmedStop,
        metadata: input.metadata,
        state: ["processing", "failed"].includes(item.state) ? "uploaded" : item.state,
        error: ["processing", "failed"].includes(item.state) ? null : item.error,
        leaseToken: null,
        leaseExpiresAt: null,
        version: item.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(importItems.id, itemId))
      .returning();
    await updateBatchState(tx, auth.userId, batchId);
    return serializeImportItem(row);
  });
}

export async function getImportPhoto(auth: AuthContext, batchId: string, itemId: string) {
  const item = await ownedItem(db, auth.userId, batchId, itemId);
  if (!item.photoPath || ["duplicate", "pending_upload"].includes(item.state)) notFound();
  const { url, expiresAt } = await signCapturePhoto(auth, item.photoPath);
  return { url, expiresAt };
}

export async function checkAnalysisBudget(tx: Transaction, userId: string) {
  const [count] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(apiRequests)
    .where(
      and(
        eq(apiRequests.userId, userId),
        inArray(apiRequests.operation, ["import.analyze", "taste.analyze"]),
        gt(apiRequests.createdAt, new Date(Date.now() - 3_600_000)),
      ),
    );
  if (count.n > 30)
    throw new ApiError(429, "rate_limited", "Analysis limit reached. Try again later.");
}

export async function analyzeImport(
  auth: AuthContext,
  batchId: string,
  input: ImportAnalyzeRequest,
) {
  if (!input.consentImages) invalidRequest("Image analysis requires consent.");
  const work = await db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const batch = await ownedBatch(tx, auth.userId, batchId);
    const request = await reserveRequest(tx, auth.userId, input.requestId, "import.analyze", {
      batchId,
      ...input,
    });
    if (!request.resourceId) checkMemoryVersion(batch.version, input.expectedVersion);
    await checkAnalysisBudget(tx, auth.userId);
    const items: Item[] = [];
    let expired = false;
    for (const id of input.itemIds) {
      const item = await ownedItem(tx, auth.userId, batchId, id);
      if (["ready", "committed"].includes(item.state)) continue;
      if (
        item.state === "processing" &&
        item.leaseExpiresAt &&
        item.leaseExpiresAt.getTime() > Date.now()
      )
        continue;
      if (!["uploaded", "failed", "processing"].includes(item.state) || !item.photoPath)
        invalidRequest("Complete each selected upload before analysis.");
      if (item.attempts >= 3 || item.error?.retryable === false) {
        if (item.state === "processing") {
          await tx
            .update(importItems)
            .set({
              state: "failed",
              leaseToken: null,
              leaseExpiresAt: null,
              error: {
                code: "attempts_exhausted",
                message: "Analysis could not finish. You can still review and save this photo.",
                retryable: false,
              },
              version: item.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(importItems.id, id));
          expired = true;
        }
        continue;
      }
      const [leased] = await tx
        .update(importItems)
        .set({
          state: "processing",
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + leaseMs),
          attempts: item.attempts + 1,
          error: null,
          version: item.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(importItems.id, id))
        .returning();
      items.push(leased);
    }
    await completeRequest(tx, auth.userId, input.requestId, batchId);
    if (items.length || expired) await updateBatchState(tx, auth.userId, batchId);
    return items;
  });
  for (let start = 0; start < work.length; start += 2) {
    await Promise.all(
      work.slice(start, start + 2).map(async (item) => {
        let analysis: Item["analysis"] = null;
        let error: Item["error"] = null;
        try {
          const photo = await signCapturePhoto(auth, item.photoPath!);
          analysis = memoryAnalysisSchema.parse(await tasteProvider.image(photo.url));
        } catch (failure) {
          const providerError =
            failure instanceof TasteProviderError
              ? failure
              : new TasteProviderError("provider_unavailable", true);
          error = {
            code: providerError.code,
            message: providerError.message,
            retryable: providerError.retryable && item.attempts < 3,
          };
        }
        await db.transaction(async (tx) => {
          await lockUser(tx, auth.userId);
          const updated = await tx
            .update(importItems)
            .set({
              analysis,
              error,
              state: error ? "failed" : "ready",
              leaseToken: null,
              leaseExpiresAt: null,
              version: item.version + 1,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(importItems.id, item.id),
                eq(importItems.ownerId, auth.userId),
                eq(importItems.version, item.version),
                eq(importItems.leaseToken, item.leaseToken!),
                gt(importItems.leaseExpiresAt, new Date()),
              ),
            )
            .returning();
          if (updated.length) await updateBatchState(tx, auth.userId, batchId);
        });
      }),
    );
  }
  return getImportBatch(auth, batchId);
}

const commitReceipt = z.object({
  momentIds: z.array(z.string().uuid()),
  editionIds: z.array(z.string().uuid()),
});

export async function commitImport(
  auth: AuthContext,
  batchId: string,
  input: ImportCommitRequest,
): Promise<ImportCommitDto> {
  return db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const batch = await ownedBatch(tx, auth.userId, batchId);
    const request = await reserveRequest(tx, auth.userId, input.requestId, "import.commit", {
      batchId,
      ...input,
    });
    if (request.resourceId) {
      const receipt = commitReceipt.parse(JSON.parse(request.resourcePath!));
      const moments = receipt.momentIds.length
        ? await tx
            .select()
            .from(memoryMoments)
            .where(
              and(
                inArray(memoryMoments.id, receipt.momentIds),
                eq(memoryMoments.authorId, auth.userId),
                isNull(memoryMoments.withdrawnAt),
              ),
            )
            .orderBy(asc(memoryMoments.id))
        : [];
      if (moments.length !== receipt.momentIds.length) deletedResource();
      const remainingEditions = receipt.editionIds.length
        ? await tx
            .select({ id: editions.id })
            .from(editions)
            .where(and(inArray(editions.id, receipt.editionIds), eq(editions.userId, auth.userId)))
        : [];
      return {
        batch: await getImportBatch(auth, batchId, tx),
        moments: moments.map(serializeImportMoment),
        editionIds: remainingEditions.map((row) => row.id),
      };
    }
    checkMemoryVersion(batch.version, input.expectedVersion);
    let albumId: string | null = null;
    if (input.target.kind === "album") {
      if (!input.target.confirmShare) invalidRequest("Confirm sharing before contributing photos.");
      const [album] = await tx
        .select()
        .from(tripAlbums)
        .where(eq(tripAlbums.id, input.target.albumId))
        .for("share");
      if (!album) notFound();
      if (album.ownerId !== auth.userId) {
        const [member] = await tx
          .select()
          .from(tripAlbumMembers)
          .where(
            and(
              eq(tripAlbumMembers.albumId, album.id),
              eq(tripAlbumMembers.userId, auth.userId),
              eq(tripAlbumMembers.state, "accepted"),
            ),
          )
          .for("share");
        if (!member) notFound();
      }
      albumId = album.id;
    }
    const moments: MemoryMomentDto[] = [];
    const editionIds: string[] = [];
    for (const selected of input.items) {
      const item = await ownedItem(tx, auth.userId, batchId, selected.itemId);
      if (!["uploaded", "ready"].includes(item.state))
        invalidRequest("Select uploaded or reviewed images that have not been saved.");
      const stop = item.confirmedStop;
      if (stop) await requireSocialPlaces(auth.userId, [stop.placeId], tx);
      if (selected.createVisit && !stop)
        invalidRequest("Confirm a place, date and timezone before creating a visit.");
      const [existingMoment] = await tx
        .select({ id: memoryMoments.id })
        .from(memoryMoments)
        .where(eq(memoryMoments.sourceImportItemId, item.id));
      if (existingMoment) throw new ApiError(409, "conflict", "This image already has a moment.");
      let editionId: string | null = null;
      if (selected.createVisit && stop) {
        const editionInput = normalizeEdition({
          requestId: randomUUID(),
          placeId: stop.placeId,
          capturedAt: stop.capturedAt,
          timezone: stop.timezone,
          photoPath: item.photoPath,
          note: selected.note,
          visibility: "private",
          origin: "import",
          importSourceId: `memory:${item.id}`,
        });
        await reserveRequest(
          tx,
          auth.userId,
          editionInput.requestId,
          "edition.create",
          editionInput,
          editionInput.importSourceId,
        );
        const [counter] = await tx
          .insert(editionCounters)
          .values({ userId: auth.userId, placeId: stop.placeId, lastSequence: 1 })
          .onConflictDoUpdate({
            target: [editionCounters.userId, editionCounters.placeId],
            set: { lastSequence: sql`${editionCounters.lastSequence} + 1` },
          })
          .returning();
        const [edition] = await tx
          .insert(editions)
          .values({
            ...editionInput,
            userId: auth.userId,
            visitSequence: counter.lastSequence,
            capturedAt: new Date(stop.capturedAt),
          })
          .returning();
        await completeRequest(tx, auth.userId, editionInput.requestId, edition.id, item.photoPath);
        editionId = edition.id;
        editionIds.push(edition.id);
        await syncEditionActivity(tx, auth.userId, edition.id);
        await afterEditionChange(tx, auth.userId, edition.placeId);
      }
      const [moment] = await tx
        .insert(memoryMoments)
        .values({
          authorId: auth.userId,
          requestId: item.id,
          albumId,
          sourceImportItemId: item.id,
          placeId: stop?.placeId ?? null,
          capturedAt: stop ? new Date(stop.capturedAt) : null,
          timezone: stop?.timezone ?? null,
          groupKey: item.groupKey,
          note: selected.note,
        })
        .returning();
      moments.push(serializeImportMoment(moment));
      await tx
        .update(importItems)
        .set({ state: "committed", editionId, version: item.version + 1, updatedAt: new Date() })
        .where(eq(importItems.id, item.id));
    }
    await updateBatchState(tx, auth.userId, batchId);
    await completeRequest(
      tx,
      auth.userId,
      input.requestId,
      batchId,
      JSON.stringify({ momentIds: moments.map((moment) => moment.id), editionIds }),
    );
    return { batch: await getImportBatch(auth, batchId, tx), moments, editionIds };
  });
}

export async function deleteImport(
  auth: AuthContext,
  batchId: string,
  itemId: string | null,
  input: MemoryMutation,
) {
  const paths = await db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.ownerId, auth.userId)));
    const rows = batch
      ? await tx
          .select()
          .from(importItems)
          .where(
            and(
              eq(importItems.batchId, batchId),
              eq(importItems.ownerId, auth.userId),
              itemId ? eq(importItems.id, itemId) : undefined,
            ),
          )
      : [];
    if (!batch || (itemId && !rows.length)) {
      const [receipt] = await tx
        .select()
        .from(apiRequests)
        .where(
          and(
            eq(apiRequests.userId, auth.userId),
            eq(apiRequests.operation, itemId ? "import.item.create" : "import.batch.create"),
            eq(apiRequests.resourceId, itemId ?? batchId),
          ),
        );
      if (!receipt) notFound();
      return itemId
        ? receipt.resourcePath
          ? [receipt.resourcePath]
          : []
        : z.array(z.string()).parse(JSON.parse(receipt.resourcePath ?? "[]"));
    }
    checkMemoryVersion(itemId ? rows[0].version : batch.version, input.expectedVersion);
    const ids = rows.map((row) => row.id);
    const paths = rows.flatMap((row) => (row.photoPath ? [row.photoPath] : []));
    if (ids.length) {
      const duplicates = await tx
        .delete(importItems)
        .where(
          and(eq(importItems.ownerId, auth.userId), inArray(importItems.duplicateOfItemId, ids)),
        )
        .returning();
      await tx
        .delete(tasteEvidence)
        .where(
          and(
            eq(tasteEvidence.userId, auth.userId),
            eq(tasteEvidence.sourceKind, "import_item"),
            inArray(tasteEvidence.sourceId, ids),
          ),
        );
      await tx
        .delete(importItems)
        .where(and(eq(importItems.ownerId, auth.userId), inArray(importItems.id, ids)));
      for (const otherBatch of new Set(
        duplicates.map((row) => row.batchId).filter((id) => id !== batchId),
      ))
        await updateBatchState(tx, auth.userId, otherBatch);
      const [profile] = await tx
        .select()
        .from(tasteProfiles)
        .where(eq(tasteProfiles.userId, auth.userId));
      if (profile) {
        const affected = (source: { kind: string; id: string }) =>
          source.kind === "import_item" && ids.includes(source.id);
        if (profile.selectedSources.some(affected)) {
          await tx
            .update(tasteProfiles)
            .set({
              selectedSources: profile.selectedSources.filter((source) => !affected(source)),
              excludedSources: profile.excludedSources.filter((source) => !affected(source)),
              draft: null,
              published: null,
              sharing: "private",
              analysisState: "idle",
              analysisRequestId: null,
              leaseToken: null,
              leaseExpiresAt: null,
              version: profile.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(tasteProfiles.userId, auth.userId));
        }
      }
    }
    if (itemId) await updateBatchState(tx, auth.userId, batchId);
    else {
      await tx
        .update(apiRequests)
        .set({ resourcePath: JSON.stringify(paths) })
        .where(
          and(
            eq(apiRequests.userId, auth.userId),
            eq(apiRequests.operation, "import.batch.create"),
            eq(apiRequests.resourceId, batchId),
          ),
        );
      await tx
        .delete(importBatches)
        .where(and(eq(importBatches.id, batchId), eq(importBatches.ownerId, auth.userId)));
    }
    return paths;
  });
  await cleanupMemoryPhotos(auth, paths);
  return { deleted: true as const };
}
