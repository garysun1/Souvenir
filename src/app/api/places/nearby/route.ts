import { apiRoute, dataResponse } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/server";
import { nearbyQuerySchema } from "@/lib/contracts/api";
import { getNearbyPlaces } from "@/lib/places/coverage";
import { ApiError } from "@/lib/server/errors";

export async function GET(request: Request) {
  return apiRoute(async () => {
    const result = await requireApiUser(request);
    if ("response" in result) return result.response;
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].length !== new Set(params.keys()).size)
      throw new ApiError(400, "invalid_request", "Duplicate query parameters are not supported.");
    return dataResponse(await getNearbyPlaces(nearbyQuerySchema.parse(Object.fromEntries(params))));
  });
}
