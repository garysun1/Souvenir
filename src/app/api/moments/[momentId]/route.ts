import { dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import {
  memoryMomentPatchSchema,
  memoryVersionSchema,
  momentParamsSchema,
} from "@/lib/contracts/memories";
import {
  deleteMemoryMoment,
  getMemoryMoment,
  updateMemoryMoment,
} from "@/lib/server/memory-sharing-moments";

type Context = { params: Promise<{ momentId: string }> };

export async function GET(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { momentId } = momentParamsSchema.parse(await params);
    return dataResponse(await getMemoryMoment(auth.userId, momentId));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { momentId } = momentParamsSchema.parse(await params);
    const parsed = await parseJsonBody(request, memoryMomentPatchSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await updateMemoryMoment(auth.userId, momentId, parsed.data));
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { momentId } = momentParamsSchema.parse(await params);
    const parsed = await parseJsonBody(request, memoryVersionSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await deleteMemoryMoment(auth.userId, momentId, parsed.data));
  });
}
