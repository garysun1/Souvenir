import {
  createdResponse,
  dataResponse,
  parseJsonBody,
  withApiUser,
  type SlugParams,
} from "@/lib/api";
import { placeNoteCreateSchema, placeSlugParamsSchema } from "@/lib/contracts/api";
import { createPlaceNote, getPlaceNotes } from "@/lib/server/place-metadata";

export async function GET(request: Request, context: SlugParams) {
  return withApiUser(request, async (auth) => {
    const { slug } = placeSlugParamsSchema.parse(await context.params);
    return dataResponse(await getPlaceNotes(auth.userId, slug));
  });
}

export async function POST(request: Request, context: SlugParams) {
  return withApiUser(request, async (auth) => {
    const { slug } = placeSlugParamsSchema.parse(await context.params);
    const body = await parseJsonBody(request, placeNoteCreateSchema);
    if ("response" in body) return body.response;
    return createdResponse(await createPlaceNote(auth.userId, slug, body.data));
  });
}
