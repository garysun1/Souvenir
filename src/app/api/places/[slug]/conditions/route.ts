import { apiRoute, requireNoQuery, slugSchema, type SlugParams } from "@/lib/api";
import { getPlace } from "@/lib/server/catalog";
import { ApiError } from "@/lib/server/errors";

export async function GET(request: Request, { params }: SlugParams) {
  return apiRoute(async () => {
    requireNoQuery(request);
    await getPlace(slugSchema.parse((await params).slug));
    throw new ApiError(503, "service_unavailable", "Live conditions are not connected.");
  });
}
