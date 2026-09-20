import { apiRoute, dataResponse, parseJsonBody, requireNoQuery } from "@/lib/api";
import { getSearchService } from "@/lib/search";
import { searchQuerySchema } from "@/lib/schemas";
import { z } from "zod";

const boundedSearchSchema = searchQuerySchema
  .extend({
    q: z.string().max(200).default(""),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), "Supply both coordinates");

export async function POST(request: Request) {
  return apiRoute(async () => {
    requireNoQuery(request);
    const parsed = await parseJsonBody(request, boundedSearchSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await getSearchService().search(parsed.data));
  });
}
