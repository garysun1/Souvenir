import { env } from "@/lib/env";
import type { SearchQuery, SearchResult } from "@/lib/schemas";
import { ElasticSearchService } from "./es";
import { searchPg } from "./pgFallback";

export interface SearchService {
  search(q: SearchQuery): Promise<SearchResult[]>;
}

export function getSearchService(): SearchService {
  if (env.SEARCH_PROVIDER === "es") {
    return new ElasticSearchService();
  }
  return { search: searchPg };
}
