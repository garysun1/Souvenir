import { createdResponse, dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import {
  albumMemberInviteSchema,
  albumParamsSchema,
  memoryPageQuerySchema,
} from "@/lib/contracts/memories";
import { getMemoryAlbumMembers, inviteMemoryAlbumMember } from "@/lib/server/memory-sharing-albums";
import { socialQueryRoute } from "@/lib/server/social-api";

type Context = { params: Promise<{ albumId: string }> };

export async function GET(request: Request, { params }: Context) {
  return socialQueryRoute(request, memoryPageQuerySchema, async (auth, query) => {
    const { albumId } = albumParamsSchema.parse(await params);
    return dataResponse(await getMemoryAlbumMembers(auth.userId, albumId, query));
  });
}

export async function POST(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { albumId } = albumParamsSchema.parse(await params);
    const parsed = await parseJsonBody(request, albumMemberInviteSchema);
    if ("response" in parsed) return parsed.response;
    return createdResponse(await inviteMemoryAlbumMember(auth.userId, albumId, parsed.data));
  });
}
