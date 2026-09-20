import { apiRoute, dataResponse, requireNoQuery, type SlugParams } from "@/lib/api";
import { placeSlugParamsSchema } from "@/lib/contracts/api";
import { getPlace } from "@/lib/server/catalog";
import { requireApiUser } from "@/lib/auth/server";
import { getPlaceDetail } from "@/lib/server/place-detail";

export async function GET(request: Request, { params }: SlugParams) {
  return apiRoute(async () => {
    requireNoQuery(request);
    const { slug } = placeSlugParamsSchema.parse(await params);
    const result = await requireApiUser(request);
    if ("auth" in result) return dataResponse(await getPlaceDetail(result.auth.userId, slug));
    if (request.headers.has("authorization")) return result.response;
    return dataResponse(await getPlace(slug));
  });
}
