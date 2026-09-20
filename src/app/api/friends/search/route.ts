import { dataResponse } from "@/lib/api";
import { friendSearchQuerySchema } from "@/lib/contracts/api";
import { searchFriends } from "@/lib/server/social";
import { socialQueryRoute } from "@/lib/server/social-api";

export async function GET(request: Request) {
  return socialQueryRoute(request, friendSearchQuerySchema, async (auth, query) =>
    dataResponse(await searchFriends(auth.userId, query)),
  );
}
