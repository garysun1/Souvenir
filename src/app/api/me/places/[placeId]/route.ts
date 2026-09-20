import { dataResponse, parseJsonBody, withApiUser, type PlaceIdParams } from "@/lib/api";
import { placePreferencePutSchema, uuidSchema } from "@/lib/contracts/api";
import { putPlacePreference } from "@/lib/server/rankings";

export async function PUT(request: Request, { params }: PlaceIdParams) {
  return withApiUser(request, async (auth) => {
    const placeId = uuidSchema.parse((await params).placeId);
    const parsed = await parseJsonBody(request, placePreferencePutSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await putPlacePreference(auth.userId, placeId, parsed.data));
  });
}
