import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import type { Place, SearchQuery, SearchResult } from "@/lib/schemas";

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toPlace(row: typeof places.$inferSelect): Place {
  return {
    id: row.id, slug: row.slug, name: row.name, category: row.category, lat: row.lat, lng: row.lng,
    city: row.city, description: row.description, heroImageUrl: row.heroImageUrl,
    rarityTier: row.rarityTier, rarityAppeal: row.rarityAppeal, rarityDiscoveryFreq: row.rarityDiscoveryFreq,
    rarityAvailability: row.rarityAvailability, externalIds: row.externalIds ?? null, stats: row.stats ?? null,
    createdAt: row.createdAt,
  };
}

export async function searchPg(query: SearchQuery): Promise<SearchResult[]> {
  const terms = query.q.trim();
  const rows = await db.select().from(places).where(and(
    query.category ? eq(places.category, query.category) : undefined,
    terms ? or(ilike(places.name, `%${terms}%`), ilike(places.description, `%${terms}%`)) : undefined,
  ));
  return rows.map((row) => {
    const place = toPlace(row);
    const distanceKm = query.lat !== undefined && query.lng !== undefined ? haversineKm(query.lat, query.lng, place.lat, place.lng) : null;
    return { place, distanceKm, score: distanceKm === null ? 1 : 1 / (1 + distanceKm) };
  }).filter((result) => result.distanceKm === null || result.distanceKm <= query.radiusKm)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, query.limit);
}
