import { dataResponse } from "@/lib/api";
import { leaderboardQuerySchema } from "@/lib/contracts/api";
import { getLeaderboard } from "@/lib/server/social";
import { socialQueryRoute } from "@/lib/server/social-api";

export async function GET(request: Request) {
  return socialQueryRoute(request, leaderboardQuerySchema, async (auth, query) =>
    dataResponse(await getLeaderboard(auth.userId, query)),
  );
}
