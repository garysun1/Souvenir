import { createdResponse, dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { memoryPageQuerySchema, tripAlbumCreateSchema } from "@/lib/contracts/memories";
import { createMemoryAlbum, getMemoryAlbums } from "@/lib/server/memory-sharing-albums";
import { socialQueryRoute } from "@/lib/server/social-api";

export async function GET(request: Request) {
  return socialQueryRoute(request, memoryPageQuerySchema, async (auth, query) =>
    dataResponse(await getMemoryAlbums(auth.userId, query)),
  );
}

export async function POST(request: Request) {
  return withApiUser(request, async (auth) => {
    const parsed = await parseJsonBody(request, tripAlbumCreateSchema);
    if ("response" in parsed) return parsed.response;
    return createdResponse(await createMemoryAlbum(auth.userId, parsed.data));
  });
}
