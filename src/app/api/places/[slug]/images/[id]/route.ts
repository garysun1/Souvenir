import { dataResponse, withApiUser } from "@/lib/api";
import { placeNoteParamsSchema } from "@/lib/contracts/api";
import { deletePlaceImage } from "@/lib/server/place-images";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string; id: string }> },
) {
  return withApiUser(request, async (auth) => {
    const { slug, id } = placeNoteParamsSchema.parse(await context.params);
    return dataResponse(await deletePlaceImage(auth, slug, id));
  });
}
