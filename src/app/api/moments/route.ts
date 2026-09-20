import { createdResponse, dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { memoryMomentCreateSchema, memoryPageQuerySchema } from "@/lib/contracts/memories";
import { createMemoryMoment, getMemoryMoments } from "@/lib/server/memory-sharing-moments";
import { socialQueryRoute } from "@/lib/server/social-api";

export async function GET(request: Request) {
  return socialQueryRoute(request, memoryPageQuerySchema, async (auth, query) =>
    dataResponse(await getMemoryMoments(auth.userId, query)),
  );
}

export async function POST(request: Request) {
  return withApiUser(request, async (auth) => {
    const parsed = await parseJsonBody(request, memoryMomentCreateSchema);
    if ("response" in parsed) return parsed.response;
    return createdResponse(await createMemoryMoment(auth.userId, parsed.data));
  });
}
