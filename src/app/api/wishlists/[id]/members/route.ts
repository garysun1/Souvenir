import { dataResponse, parseJsonBody, withApiUser, type IdParams } from "@/lib/api";
import { uuidSchema, wishlistMemberSchema } from "@/lib/contracts/api";
import { addWishlistMember } from "@/lib/server/wishlists";

export async function POST(request: Request, { params }: IdParams) {
  return withApiUser(request, async (auth) => {
    const id = uuidSchema.parse((await params).id);
    const parsed = await parseJsonBody(request, wishlistMemberSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await addWishlistMember(auth.userId, id, parsed.data.handle));
  });
}
