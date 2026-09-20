import { createdResponse, dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { planCreateSchema } from "@/lib/contracts/api";
import { createPlan, getPlans } from "@/lib/server/plans";

export async function GET(request: Request) {
  return withApiUser(request, async (auth) => dataResponse(await getPlans(auth.userId)));
}

export async function POST(request: Request) {
  return withApiUser(request, async (auth) => {
    const parsed = await parseJsonBody(request, planCreateSchema);
    if ("response" in parsed) return parsed.response;
    return createdResponse(await createPlan(auth.userId, parsed.data));
  });
}
