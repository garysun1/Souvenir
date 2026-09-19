import type { SearchQuery, SearchResult } from "@/lib/schemas";
import type { SearchService } from "./index";

export class ElasticSearchService implements SearchService {
  async search(_q: SearchQuery): Promise<SearchResult[]> {
    throw new Error("NotImplemented: Elasticsearch search provider");
  }
}
