import { dataResponse, withApiUser } from "@/lib/api";
import { momentParamsSchema } from "@/lib/contracts/memories";
import { getMemoryPhoto } from "@/lib/server/memory-sharing-media";

type Context = { params: Promise<{ momentId: string }> };

export async function GET(request: Request, { params }: Context) {
  return withApiUser(request, async (auth) => {
    const { momentId } = momentParamsSchema.parse(await params);
    return dataResponse(await getMemoryPhoto(auth.userId, momentId));
  });
}
