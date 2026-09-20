import { dataResponse } from "@/lib/api";
import { trendingQuerySchema } from "@/lib/contracts/api";
import { getTrending } from "@/lib/server/social";
import { socialQueryRoute } from "@/lib/server/social-api";

export async function GET(request: Request) {
  return socialQueryRoute(request, trendingQuerySchema, async (auth, query) =>
    dataResponse(await getTrending(auth.userId, query)),
  );
}
