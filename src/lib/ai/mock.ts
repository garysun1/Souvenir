import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import type { IdentifyResponse, PlanRequest, PlanResponse } from "@/lib/schemas";
import { searchPg } from "@/lib/search/pgFallback";

export const mockProvider = {
  async identifyPlace(): Promise<IdentifyResponse> {
    const [row] = await db.select().from(places).orderBy(places.slug).limit(1);
    if (!row) return { candidates: [] };
    return {
      candidates: [
        {
          place: {
            id: row.id,
            slug: row.slug,
            name: row.name,
            category: row.category,
            lat: row.lat,
            lng: row.lng,
            city: row.city,
            description: row.description,
            heroImageUrl: row.heroImageUrl,
            rarityTier: row.rarityTier,
            rarityAppeal: row.rarityAppeal,
            rarityDiscoveryFreq: row.rarityDiscoveryFreq,
            rarityAvailability: row.rarityAvailability,
            externalIds: row.externalIds ?? null,
            stats: row.stats ?? null,
            createdAt: row.createdAt,
          },
          confidence: 0.42,
        },
      ],
    };
  },
  async planOuting(input: PlanRequest): Promise<PlanResponse> {
    const results = await searchPg({ q: input.query, radiusKm: 200, limit: 5 });
    return {
      title: "A Souvenir outing",
      summary: "A simple route assembled by the mock planner.",
      places: results.map((result) => result.place),
    };
  },
};
