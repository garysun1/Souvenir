import { createdResponse, parseJsonBody, withApiUser, type SlugParams } from "@/lib/api";
import { placeSlugParamsSchema, placeSuggestionSchema } from "@/lib/contracts/api";
import { createPlaceSuggestion } from "@/lib/server/place-metadata";

export async function POST(request: Request, context: SlugParams) {
  return withApiUser(request, async (auth) => {
    const { slug } = placeSlugParamsSchema.parse(await context.params);
    const body = await parseJsonBody(request, placeSuggestionSchema);
    if ("response" in body) return body.response;
    return createdResponse(await createPlaceSuggestion(auth.userId, slug, body.data));
  });
}
