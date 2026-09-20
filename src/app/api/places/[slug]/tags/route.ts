import { dataResponse, parseJsonBody, withApiUser, type SlugParams } from "@/lib/api";
import { placeSlugParamsSchema, placeTagPutSchema } from "@/lib/contracts/api";
import { getPlaceTags, putPlaceTags } from "@/lib/server/place-metadata";

export async function GET(request: Request, context: SlugParams) {
  return withApiUser(request, async (auth) => {
    const { slug } = placeSlugParamsSchema.parse(await context.params);
    return dataResponse(await getPlaceTags(auth.userId, slug));
  });
}

export async function PUT(request: Request, context: SlugParams) {
  return withApiUser(request, async (auth) => {
    const { slug } = placeSlugParamsSchema.parse(await context.params);
    const body = await parseJsonBody(request, placeTagPutSchema);
    if ("response" in body) return body.response;
    return dataResponse(await putPlaceTags(auth.userId, slug, body.data));
  });
}
