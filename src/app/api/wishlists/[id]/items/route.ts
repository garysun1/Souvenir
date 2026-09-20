import { z } from "zod";
import { dataResponse, parseJsonBody, withApiUser, type IdParams } from "@/lib/api";
import { uuidSchema, wishlistItemPutSchema } from "@/lib/contracts/api";
import { putWishlistItem } from "@/lib/server/wishlists";

export async function PUT(request: Request, { params }: IdParams) {
  return withApiUser(request, async (auth) => {
    const id = uuidSchema.parse((await params).id);
    const parsed = await parseJsonBody(request, wishlistItemPutSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await putWishlistItem(auth.userId, id, parsed.data));
  });
}

export async function POST(request: Request, { params }: IdParams) {
  return withApiUser(request, async (auth) => {
    const id = uuidSchema.parse((await params).id);
    const parsed = await parseJsonBody(request, z.object({ placeId: uuidSchema }).strict());
    if ("response" in parsed) return parsed.response;
    return dataResponse(await putWishlistItem(auth.userId, id, { ...parsed.data, saved: true }));
  });
}
