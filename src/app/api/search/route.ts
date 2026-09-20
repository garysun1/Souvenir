import { apiRoute, dataResponse, parseJsonBody, requireNoQuery } from "@/lib/api";
import { getSearchService } from "@/lib/search";
import { searchQuerySchema } from "@/lib/schemas";

export async function POST(request: Request) {
  return apiRoute(async () => {
    requireNoQuery(request);
    const parsed = await parseJsonBody(request, searchQuerySchema.strict());
    if ("response" in parsed) return parsed.response;
    return dataResponse(await getSearchService().search(parsed.data));
  });
}
