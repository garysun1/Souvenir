import { dataResponse, withApiUser, type SlugParams } from "@/lib/api";
import { placeSlugParamsSchema } from "@/lib/contracts/api";
import { getPlaceConditions } from "@/lib/places/conditions";

export async function GET(request: Request, { params }: SlugParams) {
  return withApiUser(request, async (auth) => {
    return dataResponse(
      await getPlaceConditions(auth, placeSlugParamsSchema.parse(await params).slug),
    );
  });
}
