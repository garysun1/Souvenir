import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { coverageCells } from "@/lib/db/schema";
import type { Database } from "@/lib/server/transactions";
import { env } from "@/lib/env";
import { nearbyPg } from "@/lib/search/pgFallback";
import { getSearchService } from "@/lib/search";
import { nearbyQuerySchema } from "@/lib/contracts/api";
import type { NearbyDto, NearbyQuery } from "../../../shared/api-contract";
import { cellBounds, geohash } from "./geo";
import { getPlacesProvider } from "./index";
import { ingestProviderPlaces } from "./store";
import { ProviderError, type PlacesProvider } from "./types";

export async function acquireCoverageLease(
  cell: string,
  provider: PlacesProvider["name"],
  database: Database = db,
  now = new Date(),
): Promise<string | null> {
  cellBounds(cell);
  const token = randomUUID();
  return database.transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext('souvenir-coverage-budget')) as locked`,
    );
    if (!lock[0]?.locked) return null;
    const budget = await tx.execute<{ recent: string; daily: string }>(sql`
      select count(*) filter (where greatest(fetched_at, retry_after, lease_until) >= ${new Date(now.getTime() - 60000).toISOString()}::timestamptz)::text as recent,
      count(*) filter (where greatest(fetched_at, retry_after, lease_until) >= ${new Date(now.getTime() - 86400000).toISOString()}::timestamptz)::text as daily
      from ${coverageCells}`);
    if (Number(budget[0]?.recent) > 0 || Number(budget[0]?.daily) >= 100) return null;
    const [row] = await tx
      .insert(coverageCells)
      .values({
        geohash: cell,
        provider,
        status: "pending",
        leaseToken: token,
        leaseUntil: new Date(now.getTime() + 60000),
      })
      .onConflictDoUpdate({
        target: [coverageCells.geohash, coverageCells.provider],
        set: { status: "pending", leaseToken: token, leaseUntil: new Date(now.getTime() + 60000) },
        setWhere: sql`(${coverageCells.leaseUntil} is null or ${coverageCells.leaseUntil} <= ${now.toISOString()}::timestamptz)
        and (${coverageCells.expiresAt} is null or ${coverageCells.expiresAt} <= ${now.toISOString()}::timestamptz)
        and (${coverageCells.retryAfter} is null or ${coverageCells.retryAfter} <= ${now.toISOString()}::timestamptz)`,
      })
      .returning({ token: coverageCells.leaseToken });
    return row?.token ?? null;
  });
}
export async function fillCoverageCell(
  cell: string,
  provider: PlacesProvider,
  database: Database = db,
): Promise<NearbyDto["coverage"]> {
  const now = new Date();
  const [existing] = await database
    .select()
    .from(coverageCells)
    .where(and(eq(coverageCells.geohash, cell), eq(coverageCells.provider, provider.name)));
  if (existing?.status === "ready" && existing.expiresAt && existing.expiresAt > now)
    return "ready";
  const token = await acquireCoverageLease(cell, provider.name, database, now);
  if (!token) return existing?.status === "pending" ? "pending" : "unavailable";
  try {
    const records = await provider.bbox(cellBounds(cell), 250);
    if (records.length > 250) throw new ProviderError("invalid_response");
    return await database.transaction(async (tx) => {
      const [lease] = await tx
        .select()
        .from(coverageCells)
        .where(
          and(
            eq(coverageCells.geohash, cell),
            eq(coverageCells.provider, provider.name),
            eq(coverageCells.leaseToken, token),
            sql`${coverageCells.leaseUntil} > ${new Date().toISOString()}::timestamptz`,
          ),
        )
        .for("update");
      if (!lease) return "pending";
      const result = await ingestProviderPlaces(records, tx);
      await tx
        .update(coverageCells)
        .set({
          status: "ready",
          fetchedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 86400000),
          resultCount: result.inserted + result.refreshed,
          retryAfter: null,
          leaseToken: null,
          leaseUntil: null,
        })
        .where(
          and(
            eq(coverageCells.geohash, cell),
            eq(coverageCells.provider, provider.name),
            eq(coverageCells.leaseToken, token),
          ),
        );
      return "ready";
    });
  } catch (error) {
    const backoff = Math.max(30 * 60000, error instanceof ProviderError ? error.retryAfterMs : 0);
    await database
      .update(coverageCells)
      .set({
        status: "failed",
        retryAfter: new Date(Date.now() + backoff),
        leaseToken: null,
        leaseUntil: null,
      })
      .where(
        and(
          eq(coverageCells.geohash, cell),
          eq(coverageCells.provider, provider.name),
          eq(coverageCells.leaseToken, token),
        ),
      );
    return "unavailable";
  }
}
export async function getNearbyPlaces(
  input: NearbyQuery,
  database: Database = db,
  options: { provider?: PlacesProvider; lazyFill?: boolean } = {},
): Promise<NearbyDto> {
  const query = nearbyQuerySchema.parse(input);
  const initial =
    database === db ? await getSearchService().nearby(query) : await nearbyPg(query, database);
  if (initial.length >= Math.min(8, query.limit) || !(options.lazyFill ?? env.PLACES_LAZY_FILL)) {
    return { places: initial, provenance: "catalog", coverage: "unavailable" };
  }
  let provider: PlacesProvider;
  try {
    provider = options.provider ?? getPlacesProvider();
  } catch {
    return { places: initial, provenance: "catalog", coverage: "unavailable" };
  }
  const coverage = await fillCoverageCell(geohash(query.lat, query.lng, 5), provider, database);
  const results = coverage === "ready" ? await nearbyPg(query, database) : initial;
  return {
    places: results,
    provenance: results.some(
      (item) => !initial.some((previous) => previous.place.id === item.place.id),
    )
      ? initial.length
        ? "mixed"
        : "provider"
      : "catalog",
    coverage,
  };
}
