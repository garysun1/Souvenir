import { z } from "zod";
import { apiRoute, dataResponse } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/server";
import { getSearchService } from "@/lib/search";
import { searchQuerySchema } from "@/lib/schemas";
import { ApiError } from "@/lib/server/errors";

const querySchema = searchQuerySchema
  .extend({
    q: z.string().trim().max(200).default(""),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(200).default(25),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), "Supply both coordinates");
export async function GET(request: Request) {
  return apiRoute(async () => {
    const result = await requireApiUser(request);
    if ("response" in result) return result.response;
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].length !== new Set(params.keys()).size ||
      [...params.values()].some((value) => !value.trim())
    ) {
      throw new ApiError(400, "invalid_request", "Invalid search parameters.");
    }
    return dataResponse(
      await getSearchService().search(querySchema.parse(Object.fromEntries(params))),
    );
  });
}
