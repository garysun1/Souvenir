import { z } from "zod";
import { boundingBoxSchema, nearbyQuerySchema } from "@/lib/contracts/api";
import type { BoundingBox, NearbyQuery } from "../../../shared/api-contract";
import { categorize } from "./categorize";
import { distanceM, inBounds, radiusBounds, splitBounds } from "./geo";
import type { ProviderHttp } from "./http";
import {
  ProviderError,
  providerPlaceSchema,
  safeUrlSchema,
  type PlacesProvider,
  type ProviderPlace,
} from "./types";

const elementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number().int().positive().safe(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string()).default({}),
});
const responseSchema = z.object({
  elements: z.array(z.unknown()).max(500),
  remark: z.string().optional(),
});
export function parseOverpass(data: unknown, fetchedAt: string): ProviderPlace[] {
  const response = responseSchema.safeParse(data);
  if (!response.success || response.data.remark) throw new ProviderError("invalid_response");
  return response.data.elements.flatMap((raw) => {
    const result = elementSchema.safeParse(raw);
    if (!result.success) return [];
    const element = result.data,
      tags = element.tags;
    const category = categorize(tags);
    const website = safeUrlSchema.safeParse(tags.website ?? tags["contact:website"]);
    const record = providerPlaceSchema.safeParse({
      provider: "osm",
      providerId: `${element.type}/${element.id}`,
      name: tags.name ?? tags["name:en"],
      category,
      lat: element.lat ?? element.center?.lat,
      lng: element.lon ?? element.center?.lon,
      city: tags["addr:city"] ?? null,
      country: tags["addr:country"]?.toUpperCase() ?? null,
      region: tags["addr:state"] ?? null,
      timezone: tags.timezone ?? null,
      website: website.success ? website.data : null,
      openingHours: tags.opening_hours ?? null,
      wikidataId: /^Q[1-9]\d*$/.test(tags.wikidata ?? "") ? tags.wikidata : null,
      evidence: "provider",
      fetchedAt,
    });
    return record.success ? [record.data] : [];
  });
}
export function overpassQuery(box: BoundingBox, limit: number): string {
  boundingBoxSchema.parse(box);
  z.number().int().min(1).max(500).parse(limit);
  const parts = splitBounds(box);
  if (box.north - box.south > 1 || parts.reduce((n, p) => n + p.east - p.west, 0) > 1) {
    throw new RangeError("Provider bounds must span at most one degree.");
  }
  const filters = [
    '["tourism"~"^(museum|gallery|artwork|attraction|viewpoint)$"]',
    '["leisure"~"^(park|garden|nature_reserve)$"]',
    '["historic"]',
    '["amenity"~"^(restaurant|cafe|food_court|marketplace|theatre|arts_centre|library|place_of_worship)$"]',
    '["natural"~"^(beach|peak|waterfall)$"]',
  ];
  const selectors = parts.flatMap((p) =>
    filters.map((filter) => `nwr${filter}["name"](${p.south},${p.west},${p.north},${p.east});`),
  );
  return `[out:json][timeout:5][maxsize:16777216];(${selectors.join("")});out center tags ${limit};`;
}
export class OsmPlacesProvider implements PlacesProvider {
  readonly name = "osm";
  constructor(
    private readonly endpoint: string,
    private readonly http: ProviderHttp,
  ) {}
  async bbox(box: BoundingBox, limit: number): Promise<ProviderPlace[]> {
    const query = overpassQuery(box, limit);
    const response = await this.http.json(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }).toString(),
    });
    return parseOverpass(response, new Date().toISOString())
      .filter((record) => inBounds(record, box))
      .slice(0, limit);
  }
  async nearby(input: NearbyQuery): Promise<ProviderPlace[]> {
    const query = nearbyQuerySchema.parse(input);
    const records = await this.bbox(radiusBounds(query.lat, query.lng, query.radiusM), 250);
    return records
      .filter(
        (record) =>
          distanceM(query, record) <= query.radiusM &&
          (!query.category || record.category === query.category) &&
          (!query.country || record.country === query.country),
      )
      .sort(
        (a, b) =>
          distanceM(query, a) - distanceM(query, b) || a.providerId.localeCompare(b.providerId),
      )
      .slice(0, query.limit);
  }
}
