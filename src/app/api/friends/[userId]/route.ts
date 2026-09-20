import { dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { friendPutSchema, userIdParamsSchema } from "@/lib/contracts/api";
import { deleteFriend, putFriend } from "@/lib/server/social";

type Params = { params: Promise<{ userId: string }> };

export async function PUT(request: Request, context: Params) {
  return withApiUser(request, async (auth) => {
    const { userId } = userIdParamsSchema.parse(await context.params);
    const body = await parseJsonBody(request, friendPutSchema);
    if ("response" in body) return body.response;
    return dataResponse(await putFriend(auth.userId, userId));
  });
}

export async function DELETE(request: Request, context: Params) {
  return withApiUser(request, async (auth) => {
    const { userId } = userIdParamsSchema.parse(await context.params);
    return dataResponse(await deleteFriend(auth.userId, userId));
  });
}
