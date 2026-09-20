import { dataResponse } from "@/lib/api";
import { memoryPageQuerySchema } from "@/lib/contracts/memories";
import { getMemoryTagInvitations } from "@/lib/server/memory-sharing-tags";
import { socialQueryRoute } from "@/lib/server/social-api";

export async function GET(request: Request) {
  return socialQueryRoute(request, memoryPageQuerySchema, async (auth, query) =>
    dataResponse(await getMemoryTagInvitations(auth.userId, query)),
  );
}
