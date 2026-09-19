import type { SearchResult } from "@/lib/schemas";
import type { SearchService } from "./index";

export class ElasticSearchService implements SearchService {
  async search(): Promise<SearchResult[]> {
    throw new Error("NotImplemented: Elasticsearch search provider");
  }
}
