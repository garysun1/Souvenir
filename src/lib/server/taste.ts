import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiRequests, tasteEvidence, tasteProfiles } from "@/lib/db/schema";
import { signCapturePhoto } from "@/lib/auth/storage";
import {
  tasteProvider,
  TasteProviderError,
  validateTasteResult,
  type TasteSourceContent,
} from "@/lib/ai/taste";
import { aggregateTaste, tasteSourceKey } from "../../../shared/taste";
import type { AuthContext } from "../../../shared/api-contract";
import type {
  MemoryMutation,
  TasteAnalyzeRequest,
  TasteEvidenceDto,
  TasteProfileDto,
  TasteProfilePatch,
  TastePublishRequest,
  TasteSourceRef,
} from "../../../shared/memories-contract";
import { ApiError, invalidRequest, notFound } from "./errors";
import { checkAnalysisBudget, checkMemoryVersion } from "./memory-imports";
import { ownedCollageIds, resolveTasteSources, type AuthorizedTasteSource } from "./taste-sources";
import {
  completeRequest,
  lockUser,
  reserveRequest,
  type Database,
  type Transaction,
} from "./transactions";

type Profile = typeof tasteProfiles.$inferSelect;
type Evidence = typeof tasteEvidence.$inferSelect;

function evidenceDto(row: Evidence): TasteEvidenceDto {
  return {
    id: row.id,
    source: { kind: row.sourceKind, id: row.sourceId },
    interest: row.interest,
    intent: row.intent,
    confidence: row.confidence,
    explanation: row.explanation,
    analysisVersion: row.analysisVersion,
    excluded: row.excluded,
  };
}

async function profileRow(database: Database, userId: string, create: boolean) {
  if (create) await database.insert(tasteProfiles).values({ userId }).onConflictDoNothing();
  const [row] = await database.select().from(tasteProfiles).where(eq(tasteProfiles.userId, userId));
  if (!row) notFound("This taste profile is unavailable.");
  return row;
}

async function evidenceRows(database: Database, userId: string) {
  return database.select().from(tasteEvidence).where(eq(tasteEvidence.userId, userId));
}

function profileDto(
  row: Profile,
  evidence: Evidence[],
  sources: AuthorizedTasteSource[],
): TasteProfileDto {
  const draft =
    row.draft || row.overrides.length || evidence.length
      ? aggregateTaste(
          evidence.map(evidenceDto),
          sources,
          row.overrides,
          row.titleOverride ?? row.draft?.title ?? null,
        )
      : null;
  return {
    userId: row.userId,
    version: row.version,
    draft,
    published: row.published,
    sharing: row.sharing,
    overrides: row.overrides,
    preferences: row.preferences,
    titleOverride: row.titleOverride,
    selectedSources: row.selectedSources,
    excludedSources: row.excludedSources,
    collageMomentIds: row.collageMomentIds,
    evidence: evidence.map(evidenceDto),
    analysisState: row.analysisState,
    analysisVersion: row.analysisVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function currentTaste(tx: Transaction, userId: string, create = false) {
  let row = await profileRow(tx, userId, create);
  let evidence = await evidenceRows(tx, userId);
  const refs = new Map<string, TasteSourceRef>();
  for (const source of [
    ...row.selectedSources,
    ...evidence.map((e) => ({ kind: e.sourceKind, id: e.sourceId })),
  ])
    refs.set(tasteSourceKey(source), source);
  const sources = await resolveTasteSources(tx, userId, [...refs.values()], false);
  const valid = new Set(sources.map((s) => tasteSourceKey(s.source)));
  const excluded = new Set(row.excludedSources.map(tasteSourceKey));
  const obsolete = evidence.filter(
    (e) =>
      !valid.has(tasteSourceKey({ kind: e.sourceKind, id: e.sourceId })) ||
      excluded.has(tasteSourceKey({ kind: e.sourceKind, id: e.sourceId })),
  );
  const selectedSources = row.selectedSources.filter((source) => valid.has(tasteSourceKey(source)));
  const collageMomentIds = await ownedCollageIds(tx, userId, row.collageMomentIds, false);
  const publishedCollage = await ownedCollageIds(
    tx,
    userId,
    row.published?.collageMomentIds ?? [],
    false,
  );
  if (
    obsolete.length ||
    selectedSources.length !== row.selectedSources.length ||
    collageMomentIds.length !== row.collageMomentIds.length ||
    publishedCollage.length !== (row.published?.collageMomentIds.length ?? 0)
  ) {
    if (obsolete.length)
      await tx.delete(tasteEvidence).where(
        and(
          eq(tasteEvidence.userId, userId),
          inArray(
            tasteEvidence.id,
            obsolete.map((e) => e.id),
          ),
        ),
      );
    evidence = evidence.filter((e) => !obsolete.some((old) => old.id === e.id));
    const sourceChanged =
      obsolete.length > 0 || selectedSources.length !== row.selectedSources.length;
    [row] = await tx
      .update(tasteProfiles)
      .set({
        selectedSources,
        collageMomentIds,
        published: sourceChanged
          ? null
          : row.published
            ? { ...row.published, collageMomentIds: publishedCollage }
            : null,
        sharing: sourceChanged ? "private" : row.sharing,
        draft: sourceChanged ? null : row.draft,
        analysisRequestId: null,
        leaseToken: null,
        leaseExpiresAt: null,
        analysisState: "idle",
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(tasteProfiles.userId, userId))
      .returning();
  }
  return { row, evidence, sources, dto: profileDto(row, evidence, sources) };
}

export async function getTaste(auth: AuthContext) {
  return db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    return (await currentTaste(tx, auth.userId, true)).dto;
  });
}

export async function patchTaste(auth: AuthContext, input: TasteProfilePatch) {
  return db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const { row } = await currentTaste(tx, auth.userId, true);
    checkMemoryVersion(row.version, input.expectedVersion);
    if (input.collageMomentIds) await ownedCollageIds(tx, auth.userId, input.collageMomentIds);
    if (input.excludedSources) {
      const known = new Set([...row.selectedSources, ...row.excludedSources].map(tasteSourceKey));
      if (input.excludedSources.some((source) => !known.has(tasteSourceKey(source))))
        invalidRequest("Only selected sources may be excluded.");
      for (const source of input.excludedSources) {
        await tx
          .delete(tasteEvidence)
          .where(
            and(
              eq(tasteEvidence.userId, auth.userId),
              eq(tasteEvidence.sourceKind, source.kind),
              eq(tasteEvidence.sourceId, source.id),
            ),
          );
      }
    }
    await tx
      .update(tasteProfiles)
      .set({
        titleOverride: input.titleOverride,
        overrides: input.overrides,
        preferences: input.preferences,
        excludedSources: input.excludedSources,
        collageMomentIds: input.collageMomentIds,
        version: row.version + 1,
        updatedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        analysisRequestId: null,
        analysisState: "idle",
        ...(input.excludedSources ? { published: null, sharing: "private" as const } : {}),
      })
      .where(eq(tasteProfiles.userId, auth.userId));
    return (await currentTaste(tx, auth.userId)).dto;
  });
}

export async function publishTaste(auth: AuthContext, input: TastePublishRequest) {
  return db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const { row } = await currentTaste(tx, auth.userId, true);
    checkMemoryVersion(row.version, input.expectedVersion);
    if (input.sharing === "friends") {
      if (!input.confirmShare)
        invalidRequest("Confirm the selected interests and photos before sharing.");
      await ownedCollageIds(tx, auth.userId, input.collageMomentIds);
    }
    await tx
      .update(tasteProfiles)
      .set({
        sharing: input.sharing,
        published:
          input.sharing === "friends"
            ? {
                title: input.title,
                facets: input.facets.map(({ interest, intent, strength }) => ({
                  interest,
                  intent,
                  strength,
                })),
                collageMomentIds: input.collageMomentIds,
                publishedAt: new Date().toISOString(),
              }
            : null,
        version: row.version + 1,
        updatedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        analysisRequestId: null,
        analysisState: row.analysisState === "processing" ? "idle" : row.analysisState,
      })
      .where(eq(tasteProfiles.userId, auth.userId));
    return (await currentTaste(tx, auth.userId)).dto;
  });
}

export async function deleteTaste(auth: AuthContext, input: MemoryMutation) {
  return db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const [row] = await tx
      .select()
      .from(tasteProfiles)
      .where(eq(tasteProfiles.userId, auth.userId));
    if (row) {
      checkMemoryVersion(row.version, input.expectedVersion);
      await tx.delete(tasteProfiles).where(eq(tasteProfiles.userId, auth.userId));
    }
    return { deleted: true as const };
  });
}

export async function analyzeTaste(auth: AuthContext, input: TasteAnalyzeRequest) {
  const work = await db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const { row, dto } = await currentTaste(tx, auth.userId, true);
    const request = await reserveRequest(tx, auth.userId, input.requestId, "taste.analyze", input);
    if (request.resourceId) {
      if (
        row.analysisRequestId !== input.requestId ||
        row.analysisState === "ready" ||
        (row.leaseExpiresAt && row.leaseExpiresAt.getTime() > Date.now())
      )
        return { dto, lease: null };
    } else {
      checkMemoryVersion(row.version, input.expectedVersion);
      if (row.leaseExpiresAt && row.leaseExpiresAt.getTime() > Date.now())
        throw new ApiError(409, "conflict", "Taste analysis is already running.");
    }
    const attempts = request.resourcePath ? Number(request.resourcePath) : 0;
    if (attempts >= 3) {
      if (row.analysisState === "processing") {
        await tx
          .update(tasteProfiles)
          .set({
            analysisState: "failed",
            leaseToken: null,
            leaseExpiresAt: null,
            version: row.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(tasteProfiles.userId, auth.userId));
        return { dto: (await currentTaste(tx, auth.userId)).dto, lease: null };
      }
      return { dto, lease: null };
    }
    await checkAnalysisBudget(tx, auth.userId);
    const excluded = new Set(row.excludedSources.map(tasteSourceKey));
    const selected = input.sources.filter((source) => !excluded.has(tasteSourceKey(source)));
    const sources = await resolveTasteSources(tx, auth.userId, selected);
    if (!input.consentImages && sources.some((source) => source.source.kind === "import_item"))
      invalidRequest("Image analysis requires consent.");
    if (input.consentImages && sources.filter((source) => source.photoPath).length > 5)
      invalidRequest("Select at most five photo sources per taste refresh.");
    const token = randomUUID();
    const selectedKeys = new Set(selected.map(tasteSourceKey));
    const removedSources = row.selectedSources.filter(
      (source) => !selectedKeys.has(tasteSourceKey(source)),
    );
    for (const source of removedSources)
      await tx
        .delete(tasteEvidence)
        .where(
          and(
            eq(tasteEvidence.userId, auth.userId),
            eq(tasteEvidence.sourceKind, source.kind),
            eq(tasteEvidence.sourceId, source.id),
          ),
        );
    const [leased] = await tx
      .update(tasteProfiles)
      .set({
        selectedSources: selected,
        analysisState: "processing",
        analysisRequestId: input.requestId,
        analysisVersion: row.analysisVersion + 1,
        leaseToken: token,
        leaseExpiresAt: new Date(Date.now() + 120_000),
        version: row.version + 1,
        updatedAt: new Date(),
        ...(removedSources.length
          ? { draft: null, published: null, sharing: "private" as const }
          : {}),
      })
      .where(eq(tasteProfiles.userId, auth.userId))
      .returning();
    await completeRequest(tx, auth.userId, input.requestId, auth.userId, String(attempts + 1));
    return { dto, lease: { row: leased, sources, token } };
  });
  if (!work.lease) return work.dto;
  const lease = work.lease;
  try {
    const content: TasteSourceContent[] = [];
    for (const source of lease.sources) {
      content.push({
        source: source.source,
        facts: source.facts,
        intent: source.intent,
        ...(input.consentImages && source.photoPath
          ? { imageUrl: (await signCapturePhoto(auth, source.photoPath)).url }
          : {}),
      });
    }
    const result = content.length
      ? validateTasteResult(await tasteProvider.analyze(content, input.note), content)
      : { title: null, observations: [] };
    const completed = await db.transaction(async (tx) => {
      await lockUser(tx, auth.userId);
      const current = await currentTaste(tx, auth.userId);
      if (
        current.row.leaseToken !== lease.token ||
        current.row.version !== lease.row.version ||
        !current.row.leaseExpiresAt ||
        current.row.leaseExpiresAt.getTime() <= Date.now()
      )
        return { dto: current.dto, stale: true };
      const freshSources = await resolveTasteSources(tx, auth.userId, lease.row.selectedSources);
      await tx.delete(tasteEvidence).where(eq(tasteEvidence.userId, auth.userId));
      if (result.observations.length)
        await tx.insert(tasteEvidence).values(
          result.observations.map((observation) => ({
            userId: auth.userId,
            sourceKind: observation.source.kind,
            sourceId: observation.source.id,
            interest: observation.interest,
            intent: observation.intent,
            confidence: observation.confidence,
            explanation: observation.explanation,
            analysisVersion: lease.row.analysisVersion,
          })),
        );
      const evidence = await evidenceRows(tx, auth.userId);
      const draft = aggregateTaste(
        evidence.map(evidenceDto),
        freshSources,
        current.row.overrides,
        result.title,
      );
      await tx
        .update(tasteProfiles)
        .set({
          draft,
          analysisState: "ready",
          leaseToken: null,
          leaseExpiresAt: null,
          version: current.row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(tasteProfiles.userId, auth.userId));
      return { dto: (await currentTaste(tx, auth.userId)).dto, stale: false };
    });
    if (completed.stale)
      throw new ApiError(
        409,
        "conflict",
        "This analysis expired or the profile changed. Refresh before retrying.",
      );
    return completed.dto;
  } catch (error) {
    await db.transaction(async (tx) => {
      await lockUser(tx, auth.userId);
      await tx
        .update(tasteProfiles)
        .set({
          analysisState: "failed",
          leaseToken: null,
          leaseExpiresAt: null,
          version: sql`${tasteProfiles.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tasteProfiles.userId, auth.userId),
            eq(tasteProfiles.leaseToken, lease.token),
            eq(tasteProfiles.version, lease.row.version),
          ),
        );
      if (error instanceof TasteProviderError && !error.retryable)
        await tx
          .update(apiRequests)
          .set({ resourcePath: "3" })
          .where(
            and(eq(apiRequests.userId, auth.userId), eq(apiRequests.requestId, input.requestId)),
          );
    });
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      503,
      "service_unavailable",
      error instanceof TasteProviderError ? error.message : "Taste analysis failed. Please retry.",
    );
  }
}
