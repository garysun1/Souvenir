import { dataResponse, withApiUser } from "@/lib/api";
import { userIdParamsSchema } from "@/lib/contracts/api";
import { getUserDetail } from "@/lib/server/social";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  return withApiUser(request, async (auth) => {
    const { userId } = userIdParamsSchema.parse(await context.params);
    return dataResponse(await getUserDetail(auth.userId, userId));
  });
}
