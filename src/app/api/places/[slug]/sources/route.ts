import { dataResponse, withApiUser, type SlugParams } from "@/lib/api";
import { placeSlugParamsSchema } from "@/lib/contracts/api";
import { getPlaceSources } from "@/lib/server/place-detail";

export async function GET(request: Request, context: SlugParams) {
  return withApiUser(request, async (auth) => {
    const { slug } = placeSlugParamsSchema.parse(await context.params);
    return dataResponse(await getPlaceSources(auth.userId, slug));
  });
}
