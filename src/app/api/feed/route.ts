import { dataResponse } from "@/lib/api";
import { feedQuerySchema } from "@/lib/contracts/api";
import { getFeed } from "@/lib/server/feed";
import { socialQueryRoute } from "@/lib/server/social-api";

export async function GET(request: Request) {
  return socialQueryRoute(request, feedQuerySchema, async (auth, query) =>
    dataResponse(await getFeed(auth.userId, query)),
  );
}
