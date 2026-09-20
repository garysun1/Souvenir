import { dataResponse, withApiUser } from "@/lib/api";
import { ensureUserProfile } from "@/lib/auth/profile";
import { getUserStats } from "@/lib/server/stats";
import type { ProfileStatsDto } from "../../../../../shared/api-contract";

export async function GET(request: Request) {
  return withApiUser(request, async (auth) =>
    dataResponse<ProfileStatsDto>({
      ...(await ensureUserProfile(auth)),
      stats: await getUserStats(auth.userId, auth.userId),
    }),
  );
}
