import { Client, type estypes } from "@elastic/elasticsearch";
import { env } from "@/lib/env";
import type { SearchResult } from "@/lib/schemas";
import type { SearchQuery } from "@/lib/schemas";
import type { SearchService } from "./index";
import { nearbyPg, searchPg, validatedSearch } from "./pgFallback";
import type { NearbyPlaceDto, NearbyQuery } from "../../../shared/api-contract";
import { nearbyQuerySchema } from "@/lib/contracts/api";
import type { places } from "@/lib/db/schema";
import { db } from "@/lib/db";
import type { Database } from "@/lib/server/transactions";

export const placeIndexMapping: estypes.MappingTypeMapping = {
  dynamic: "strict",
  properties: {
    name: { type: "text" },
    description: { type: "text" },
    city: { type: "text" },
    country: { type: "keyword" },
    category: { type: "keyword" },
    location: { type: "geo_point" },
    discoverable: { type: "boolean" },
  },
};
export function placeIndexDocument(place: typeof places.$inferSelect) {
  return {
    name: place.name,
    description: place.description,
    city: place.city,
    country: place.country,
    category: place.category,
    location: { lat: place.lat, lon: place.lng },
    discoverable:
      place.visibility === "public" && (place.source !== "user" || place.stats?.verified === true),
  };
}

export class ElasticSearchService implements SearchService {
  constructor(
    private readonly client = new Client({
      node: env.ELASTICSEARCH_URL ?? "http://localhost:9200",
      ...(env.ELASTICSEARCH_API_KEY ? { auth: { apiKey: env.ELASTICSEARCH_API_KEY } } : {}),
      requestTimeout: 3000,
      maxRetries: 1,
    }),
    private readonly database: Database = db,
  ) {}
  async search(input: SearchQuery): Promise<SearchResult[]> {
    const query = validatedSearch(input);
    const filter: estypes.QueryDslQueryContainer[] = [{ term: { discoverable: true } }];
    if (query.category) filter.push({ term: { category: query.category } });
    if (query.lat !== undefined && query.lng !== undefined)
      filter.push({
        geo_distance: {
          distance: `${query.radiusKm}km`,
          location: { lat: query.lat, lon: query.lng },
        },
      });
    try {
      const response = await this.client.search({
        index: "souvenir-places-v1",
        size: Math.min(500, query.limit * 5),
        _source: false,
        query: {
          bool: {
            filter,
            ...(query.q.trim()
              ? {
                  must: [
                    {
                      multi_match: {
                        query: query.q.trim(),
                        fields: ["name^3", "description", "city", "country"],
                      },
                    },
                  ],
                }
              : {}),
          },
        },
      });
      const results = await searchPg(
        query,
        this.database,
        response.hits.hits.map((hit) => hit._id).filter((id): id is string => !!id),
      );
      return results.length < query.limit ? searchPg(query, this.database) : results;
    } catch {
      return searchPg(query, this.database);
    }
  }
  async nearby(input: NearbyQuery): Promise<NearbyPlaceDto[]> {
    const query = nearbyQuerySchema.parse(input);
    const filter: estypes.QueryDslQueryContainer[] = [
      { term: { discoverable: true } },
      {
        geo_distance: {
          distance: `${query.radiusM}m`,
          location: { lat: query.lat, lon: query.lng },
        },
      },
    ];
    if (query.country) filter.push({ term: { country: query.country } });
    if (query.category) filter.push({ term: { category: query.category } });
    try {
      const response = await this.client.search({
        index: "souvenir-places-v1",
        size: Math.min(250, query.limit * 5),
        _source: false,
        query: { bool: { filter } },
        sort: [
          {
            _geo_distance: {
              location: { lat: query.lat, lon: query.lng },
              order: "asc",
              unit: "m",
            },
          },
        ],
      });
      const results = await nearbyPg(
        query,
        this.database,
        response.hits.hits.map((hit) => hit._id).filter((id): id is string => !!id),
      );
      return results.length < query.limit ? nearbyPg(query, this.database) : results;
    } catch {
      return nearbyPg(query, this.database);
    }
  }
}
