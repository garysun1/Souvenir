import { dataResponse, parseJsonBody, withApiUser, type PlaceIdParams } from "@/lib/api";
import { rankingPutSchema, uuidSchema } from "@/lib/contracts/api";
import { putRanking } from "@/lib/server/rankings";

export async function PUT(request: Request, { params }: PlaceIdParams) {
  return withApiUser(request, async (auth) => {
    const placeId = uuidSchema.parse((await params).placeId);
    const parsed = await parseJsonBody(request, rankingPutSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await putRanking(auth.userId, placeId, parsed.data));
  });
}
