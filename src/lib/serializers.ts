import type { Place } from "@/lib/schemas";
import type { places } from "@/lib/db/schema";

export function serializePlace(row: typeof places.$inferSelect): Place {
  return {
    id: row.id, slug: row.slug, name: row.name, category: row.category, lat: row.lat, lng: row.lng,
    city: row.city, description: row.description, heroImageUrl: row.heroImageUrl,
    rarityTier: row.rarityTier, rarityAppeal: row.rarityAppeal, rarityDiscoveryFreq: row.rarityDiscoveryFreq,
    rarityAvailability: row.rarityAvailability, externalIds: row.externalIds ?? null, stats: row.stats ?? null,
    createdAt: row.createdAt,
  };
}
