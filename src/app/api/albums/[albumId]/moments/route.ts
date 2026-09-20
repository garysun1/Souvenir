import { dataResponse } from "@/lib/api";
import { albumParamsSchema, memoryPageQuerySchema } from "@/lib/contracts/memories";
import { getMemoryAlbumMoments } from "@/lib/server/memory-sharing-moments";
import { socialQueryRoute } from "@/lib/server/social-api";

type Context = { params: Promise<{ albumId: string }> };

export async function GET(request: Request, { params }: Context) {
  return socialQueryRoute(request, memoryPageQuerySchema, async (auth, query) => {
    const { albumId } = albumParamsSchema.parse(await params);
    return dataResponse(await getMemoryAlbumMoments(auth.userId, albumId, query));
  });
}
