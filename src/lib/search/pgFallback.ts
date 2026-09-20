import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { places, placeSources } from "@/lib/db/schema";
import type { SearchQuery, SearchResult } from "@/lib/schemas";
import { searchQuerySchema } from "@/lib/schemas";
import { nearbyQuerySchema } from "@/lib/contracts/api";
import { serializePlaceSourceDto } from "@/lib/contracts/serializers";
import { serializePlace, serializePlaceDto } from "@/lib/serializers";
import type { Database } from "@/lib/server/transactions";
import type {
  BoundingBox,
  NearbyPlaceDto,
  NearbyQuery,
  PlaceSourceDto,
} from "../../../shared/api-contract";
import { distanceM, radiusBounds, splitBounds } from "@/lib/places/geo";
import { coordinatesSchema } from "@/lib/places/types";
import { discoveryPredicate } from "@/lib/places/visibility";

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return distanceM({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }) / 1000;
}

export function boundsPredicate(bounds: BoundingBox) {
  return and(
    sql`${places.lat} between ${bounds.south} and ${bounds.north}`,
    or(...splitBounds(bounds).map((box) => sql`${places.lng} between ${box.west} and ${box.east}`)),
  );
}
export function distanceExpression(lat: number, lng: number): SQL<number> {
  return sql<number>`6371000 * 2 * asin(sqrt(least(1.0, greatest(0.0,
    power(sin(radians(${places.lat}::double precision - ${lat}) / 2), 2)
    + cos(radians(${lat})) * cos(radians(${places.lat}::double precision))
    * power(sin(radians(${places.lng}::double precision - ${lng}) / 2), 2)))))`;
}
export function validatedSearch(input: SearchQuery): SearchQuery {
  const query = searchQuerySchema.strict().parse(input);
  if (query.q.length > 200 || (query.lat === undefined) !== (query.lng === undefined))
    throw new RangeError("Invalid search parameters.");
  if (query.lat !== undefined) coordinatesSchema.parse({ lat: query.lat, lng: query.lng });
  return query;
}
async function sourcesForPlaces(
  ids: string[],
  database: Database,
): Promise<Map<string, PlaceSourceDto[]>> {
  const grouped = new Map<string, PlaceSourceDto[]>();
  if (!ids.length) return grouped;
  const sources = await database
    .select()
    .from(placeSources)
    .where(inArray(placeSources.placeId, ids));
  const now = new Date();
  for (const source of sources) {
    const existing = grouped.get(source.placeId) ?? [];
    existing.push(
      serializePlaceSourceDto({
        ...source,
        status: source.expiresAt && source.expiresAt <= now ? "stale" : source.status,
      }),
    );
    grouped.set(source.placeId, existing);
  }
  return grouped;
}

export async function searchPg(
  input: SearchQuery,
  database: Database = db,
  ids?: string[],
): Promise<SearchResult[]> {
  const query = validatedSearch(input);
  const terms = query.q.trim().replace(/[\\%_]/g, "\\$&");
  const distance =
    query.lat !== undefined && query.lng !== undefined
      ? distanceExpression(query.lat, query.lng)
      : undefined;
  if (ids?.length === 0) return [];
  const rows = await database
    .select()
    .from(places)
    .where(
      and(
        discoveryPredicate(),
        ids ? inArray(places.id, ids) : undefined,
        distance && query.lat !== undefined && query.lng !== undefined
          ? and(
              boundsPredicate(radiusBounds(query.lat, query.lng, query.radiusKm * 1000)),
              sql`${distance} <= ${query.radiusKm * 1000}`,
            )
          : undefined,
        query.category ? eq(places.category, query.category) : undefined,
        terms
          ? or(
              ilike(places.name, `%${terms}%`),
              ilike(places.description, `%${terms}%`),
              ilike(places.city, `%${terms}%`),
              ilike(places.country, `%${terms}%`),
            )
          : undefined,
      ),
    )
    .orderBy(...(distance ? [distance] : []), asc(places.name), asc(places.id))
    .limit(query.limit);
  const sources = await sourcesForPlaces(
    rows.map((row) => row.id),
    database,
  );
  return rows.map((row) => {
    const place = { ...serializePlace(row), sources: sources.get(row.id) ?? [] };
    const distanceKm =
      query.lat !== undefined && query.lng !== undefined
        ? haversineKm(query.lat, query.lng, place.lat, place.lng)
        : null;
    return { place, distanceKm, score: distanceKm === null ? 1 : 1 / (1 + distanceKm) };
  });
}

export async function nearbyPg(
  input: NearbyQuery,
  database: Database = db,
  ids?: string[],
): Promise<NearbyPlaceDto[]> {
  const query = nearbyQuerySchema.parse(input);
  if (ids?.length === 0) return [];
  const distance = distanceExpression(query.lat, query.lng);
  const rows = await database
    .select({ place: places, distanceM: distance })
    .from(places)
    .where(
      and(
        discoveryPredicate(),
        boundsPredicate(radiusBounds(query.lat, query.lng, query.radiusM)),
        sql`${distance} <= ${query.radiusM}`,
        query.category ? eq(places.category, query.category) : undefined,
        query.country ? eq(places.country, query.country) : undefined,
        ids ? inArray(places.id, ids) : undefined,
      ),
    )
    .orderBy(distance, asc(places.id))
    .limit(query.limit);
  if (!rows.length) return [];
  const sources = await sourcesForPlaces(
    rows.map(({ place }) => place.id),
    database,
  );
  return rows.map(({ place, distanceM }) => ({
    place: {
      ...serializePlaceDto(place),
      sources: sources.get(place.id) ?? [],
    },
    distanceM: Number(distanceM),
  }));
}
