import { dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { invitationRespondSchema, momentTagParamsSchema } from "@/lib/contracts/memories";
import { respondMemoryTag } from "@/lib/server/memory-sharing-tags";

type Context = { params: Promise<{ momentId: string; tagId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { momentId, tagId } = momentTagParamsSchema.parse(await params);
    const parsed = await parseJsonBody(request, invitationRespondSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await respondMemoryTag(auth.userId, momentId, tagId, parsed.data));
  });
}
