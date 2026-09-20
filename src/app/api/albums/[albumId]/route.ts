import { dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import {
  albumParamsSchema,
  memoryVersionSchema,
  tripAlbumPatchSchema,
} from "@/lib/contracts/memories";
import {
  deleteMemoryAlbum,
  getMemoryAlbum,
  updateMemoryAlbum,
} from "@/lib/server/memory-sharing-albums";

type Context = { params: Promise<{ albumId: string }> };

export async function GET(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { albumId } = albumParamsSchema.parse(await params);
    return dataResponse(await getMemoryAlbum(auth.userId, albumId));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { albumId } = albumParamsSchema.parse(await params);
    const parsed = await parseJsonBody(request, tripAlbumPatchSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await updateMemoryAlbum(auth.userId, albumId, parsed.data));
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { albumId } = albumParamsSchema.parse(await params);
    const parsed = await parseJsonBody(request, memoryVersionSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await deleteMemoryAlbum(auth.userId, albumId, parsed.data));
  });
}
