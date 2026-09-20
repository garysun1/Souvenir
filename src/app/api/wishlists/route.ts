import { createdResponse, dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { wishlistCreateSchema } from "@/lib/contracts/api";
import { createWishlist, getWishlists } from "@/lib/server/wishlists";

export async function GET(request: Request) {
  return withApiUser(request, async (auth) => dataResponse(await getWishlists(auth.userId)));
}
export async function POST(request: Request) {
  return withApiUser(request, async (auth) => {
    const parsed = await parseJsonBody(request, wishlistCreateSchema);
    if ("response" in parsed) return parsed.response;
    return createdResponse(await createWishlist(auth.userId, parsed.data));
  });
}
