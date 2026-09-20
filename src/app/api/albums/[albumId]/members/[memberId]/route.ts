import { dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { albumMemberParamsSchema, invitationRespondSchema } from "@/lib/contracts/memories";
import { respondMemoryAlbumMember } from "@/lib/server/memory-sharing-albums";

type Context = { params: Promise<{ albumId: string; memberId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { albumId, memberId } = albumMemberParamsSchema.parse(await params);
    const parsed = await parseJsonBody(request, invitationRespondSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(
      await respondMemoryAlbumMember(auth.userId, albumId, memberId, parsed.data),
    );
  });
}
