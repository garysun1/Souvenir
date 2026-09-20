import { dataResponse, withApiUser, type IdParams } from "@/lib/api";
import { uuidSchema } from "@/lib/contracts/api";
import { getWishlistOverlap } from "@/lib/server/wishlists";

export async function GET(request: Request, { params }: IdParams) {
  return withApiUser(request, async (auth) =>
    dataResponse(await getWishlistOverlap(auth.userId, uuidSchema.parse((await params).id))),
  );
}
