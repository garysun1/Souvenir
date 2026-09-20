import { dataResponse, withApiUser } from "@/lib/api";
import { tasteUserParamsSchema } from "@/lib/contracts/memories";
import { getSharedTaste } from "@/lib/server/taste-comparison";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  return withApiUser(request, async (auth) => {
    const { userId } = tasteUserParamsSchema.parse(await context.params);
    return dataResponse(await getSharedTaste(auth, userId));
  });
}
