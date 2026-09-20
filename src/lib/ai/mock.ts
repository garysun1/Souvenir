import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import type { IdentifyResponse, PlanRequest, PlanResponse } from "@/lib/schemas";
import { searchPg } from "@/lib/search/pgFallback";
import { serializePlace } from "@/lib/serializers";
import { discoveryPredicate } from "@/lib/places/visibility";

export const mockProvider = {
  async identifyPlace(): Promise<IdentifyResponse> {
    const [row] = await db
      .select()
      .from(places)
      .where(discoveryPredicate())
      .orderBy(places.slug)
      .limit(1);
    if (!row) return { candidates: [] };
    return {
      candidates: [
        {
          place: serializePlace(row),
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
