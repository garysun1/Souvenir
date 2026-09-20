import { env } from "@/lib/env";
import type { SearchQuery, SearchResult } from "@/lib/schemas";
import { ElasticSearchService } from "./es";
import { nearbyPg, searchPg } from "./pgFallback";
import type { NearbyPlaceDto, NearbyQuery } from "../../../shared/api-contract";

export interface SearchService {
  search(q: SearchQuery): Promise<SearchResult[]>;
  nearby(q: NearbyQuery): Promise<NearbyPlaceDto[]>;
}
let elasticService: SearchService | undefined;

export function getSearchService(): SearchService {
  if (env.SEARCH_PROVIDER === "es") {
    return (elasticService ??= new ElasticSearchService());
  }
  return { search: searchPg, nearby: nearbyPg };
}
