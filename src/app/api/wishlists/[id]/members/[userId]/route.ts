import { dataResponse, withApiUser } from "@/lib/api";
import { uuidSchema } from "@/lib/contracts/api";
import { removeWishlistMember } from "@/lib/server/wishlists";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  return withApiUser(request, async (auth) => {
    const values = await params;
    return dataResponse(
      await removeWishlistMember(
        auth.userId,
        uuidSchema.parse(values.id),
        uuidSchema.parse(values.userId),
      ),
    );
  });
}
