import { createdResponse, dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import {
  memoryPageQuerySchema,
  momentParamsSchema,
  momentTagCreateSchema,
} from "@/lib/contracts/memories";
import { createMemoryTag, getMemoryTags } from "@/lib/server/memory-sharing-tags";
import { socialQueryRoute } from "@/lib/server/social-api";

type Context = { params: Promise<{ momentId: string }> };

export async function GET(request: Request, { params }: Context) {
  return socialQueryRoute(request, memoryPageQuerySchema, async (auth, query) => {
    const { momentId } = momentParamsSchema.parse(await params);
    return dataResponse(await getMemoryTags(auth.userId, momentId, query));
  });
}

export async function POST(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { momentId } = momentParamsSchema.parse(await params);
    const parsed = await parseJsonBody(request, momentTagCreateSchema);
    if ("response" in parsed) return parsed.response;
    return createdResponse(await createMemoryTag(auth.userId, momentId, parsed.data));
  });
}
