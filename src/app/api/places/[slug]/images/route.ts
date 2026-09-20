import {
  createdResponse,
  dataResponse,
  parseJsonBody,
  withApiUser,
  type SlugParams,
} from "@/lib/api";
import { placeImagePromoteSchema, placeSlugParamsSchema } from "@/lib/contracts/api";
import { getPlaceImages, promotePlaceImage } from "@/lib/server/place-images";

export async function GET(request: Request, context: SlugParams) {
  return withApiUser(request, async (auth) => {
    const { slug } = placeSlugParamsSchema.parse(await context.params);
    return dataResponse(await getPlaceImages(auth.userId, slug));
  });
}

export async function POST(request: Request, context: SlugParams) {
  return withApiUser(request, async (auth) => {
    const { slug } = placeSlugParamsSchema.parse(await context.params);
    const body = await parseJsonBody(request, placeImagePromoteSchema);
    if ("response" in body) return body.response;
    return createdResponse(await promotePlaceImage(auth, slug, body.data));
  });
}
