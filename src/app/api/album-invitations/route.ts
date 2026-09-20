import { dataResponse } from "@/lib/api";
import { memoryPageQuerySchema } from "@/lib/contracts/memories";
import { getMemoryAlbumInvitations } from "@/lib/server/memory-sharing-albums";
import { socialQueryRoute } from "@/lib/server/social-api";

export async function GET(request: Request) {
  return socialQueryRoute(request, memoryPageQuerySchema, async (auth, query) =>
    dataResponse(await getMemoryAlbumInvitations(auth.userId, query)),
  );
}
