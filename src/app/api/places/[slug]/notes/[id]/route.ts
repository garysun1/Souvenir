import { dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { placeNoteParamsSchema, placeNotePatchSchema } from "@/lib/contracts/api";
import { deletePlaceNote, patchPlaceNote } from "@/lib/server/place-metadata";

type Params = { params: Promise<{ slug: string; id: string }> };

export async function PATCH(request: Request, context: Params) {
  return withApiUser(request, async (auth) => {
    const { slug, id } = placeNoteParamsSchema.parse(await context.params);
    const body = await parseJsonBody(request, placeNotePatchSchema);
    if ("response" in body) return body.response;
    return dataResponse(await patchPlaceNote(auth.userId, slug, id, body.data));
  });
}

export async function DELETE(request: Request, context: Params) {
  return withApiUser(request, async (auth) => {
    const { slug, id } = placeNoteParamsSchema.parse(await context.params);
    return dataResponse(await deletePlaceNote(auth.userId, slug, id));
  });
}
