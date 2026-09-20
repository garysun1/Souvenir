import { and, eq, gt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { places, placeSources } from "@/lib/db/schema";
import type { Database, Transaction } from "@/lib/server/transactions";
import { serializePlaceSourceDto } from "@/lib/contracts/serializers";
import type { DocumentedAvailabilityDto, PlaceSourceDto } from "../../../shared/api-contract";
import { findDuplicateCandidates } from "./dedupe";
import { normalizePlace, normalizeSource } from "./normalize";
import { providerPlaceSchema, type ProviderPlace } from "./types";

export interface IngestResult {
  inserted: number;
  refreshed: number;
  needsReview: number;
  placeIds: string[];
}
export async function ingestProviderPlaces(
  records: ProviderPlace[],
  database: Database = db,
): Promise<IngestResult> {
  if (records.length > 500) throw new RangeError("Ingest batches are limited to 500 records.");
  const validated = records.map((record) => providerPlaceSchema.parse(record));
  return database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('souvenir-provider-ingest'))`);
    return ingestInTransaction(validated, tx);
  });
}
async function ingestInTransaction(
  records: ProviderPlace[],
  tx: Transaction,
): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, refreshed: 0, needsReview: 0, placeIds: [] };
  for (const record of records) {
    const [linked] = await tx
      .select({ place: places })
      .from(placeSources)
      .innerJoin(places, eq(places.id, placeSources.placeId))
      .where(
        and(
          eq(placeSources.provider, record.provider),
          eq(placeSources.providerId, record.providerId),
        ),
      );
    if (linked && (linked.place.visibility !== "public" || linked.place.source === "user")) {
      result.needsReview++;
      continue;
    }
    const normalized = normalizePlace(record);
    const candidates = await findDuplicateCandidates(
      {
        ...record,
        externalIds: normalized.externalIds ?? undefined,
        wikidataId: normalized.wikidataId,
      },
      tx,
    );
    if (candidates.length > 1 || candidates[0]?.reason === "near_name") {
      result.needsReview++;
      continue;
    }
    let placeId = candidates[0]?.place.id;
    if (!placeId) {
      const [inserted] = await tx
        .insert(places)
        .values(normalized)
        .onConflictDoNothing()
        .returning({ id: places.id });
      if (!inserted) {
        result.needsReview++;
        continue;
      }
      placeId = inserted.id;
      result.inserted++;
    } else {
      if (candidates[0].place.source === "user") {
        result.needsReview++;
        continue;
      }
      result.refreshed++;
    }
    const source = normalizeSource(record, placeId);
    const savedSources = await tx
      .insert(placeSources)
      .values(source)
      .onConflictDoUpdate({
        target: [placeSources.provider, placeSources.providerId],
        set: source,
        setWhere: and(
          eq(placeSources.placeId, placeId),
          lte(placeSources.fetchedAt, new Date(record.fetchedAt)),
        ),
      })
      .returning({ id: placeSources.id });
    if (!savedSources.length) {
      const [currentSource] = await tx
        .select({ placeId: placeSources.placeId })
        .from(placeSources)
        .where(
          and(
            eq(placeSources.provider, record.provider),
            eq(placeSources.providerId, record.providerId),
          ),
        );
      if (currentSource?.placeId !== placeId)
        throw new Error("Provider identity changed; review the source mapping before retrying.");
    }
    result.placeIds.push(placeId);
  }
  return result;
}
export async function getPlaceSources(
  placeId: string,
  database: Database = db,
  now = new Date(),
): Promise<PlaceSourceDto[]> {
  const rows = await database
    .select()
    .from(placeSources)
    .where(eq(placeSources.placeId, placeId))
    .orderBy(placeSources.provider, placeSources.providerId);
  return rows.map((row) =>
    serializePlaceSourceDto({
      ...row,
      status: row.expiresAt && row.expiresAt <= now ? "stale" : row.status,
    }),
  );
}
export async function getDocumentedAvailability(
  placeId: string,
  database: Database = db,
  now = new Date(),
): Promise<DocumentedAvailabilityDto> {
  const unknown: DocumentedAvailabilityDto = {
    status: "unknown",
    openingHours: null,
    timezone: null,
    sourceId: null,
    fetchedAt: null,
  };
  const rows = await database
    .select()
    .from(placeSources)
    .where(and(eq(placeSources.placeId, placeId), eq(placeSources.provider, "osm")))
    .orderBy(sql`${placeSources.fetchedAt} desc`)
    .limit(10);
  for (const source of rows) {
    if (
      source.payload?.evidence !== "provider" ||
      typeof source.payload.openingHours !== "string" ||
      !source.payload.openingHours.trim()
    )
      continue;
    const stale =
      source.status !== "ready" ||
      source.fetchedAt.getTime() > now.getTime() ||
      now.getTime() - source.fetchedAt.getTime() > 90 * 86400000 ||
      (source.expiresAt !== null && source.expiresAt <= now);
    return {
      status: stale ? "stale" : "known",
      openingHours: stale ? null : source.payload.openingHours.slice(0, 1000),
      timezone:
        !stale && typeof source.payload.timezone === "string" ? source.payload.timezone : null,
      sourceId: source.id,
      fetchedAt: source.fetchedAt.toISOString(),
    };
  }
  return unknown;
}
export async function activeSourceIds(placeId: string, database: Database = db, now = new Date()) {
  return database
    .select({ id: placeSources.id })
    .from(placeSources)
    .where(
      and(
        eq(placeSources.placeId, placeId),
        or(sql`${placeSources.expiresAt} is null`, gt(placeSources.expiresAt, now)),
      ),
    );
}
