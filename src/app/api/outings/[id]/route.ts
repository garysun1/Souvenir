import { dataResponse, parseJsonBody, withApiUser, type IdParams } from "@/lib/api";
import { planContentSchema, uuidSchema } from "@/lib/contracts/api";
import { deletePlan, updatePlan } from "@/lib/server/plans";

export async function PATCH(request: Request, { params }: IdParams) {
  return withApiUser(request, async (auth) => {
    const id = uuidSchema.parse((await params).id);
    const parsed = await parseJsonBody(request, planContentSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await updatePlan(auth.userId, id, parsed.data));
  });
}

export async function DELETE(request: Request, { params }: IdParams) {
  return withApiUser(request, async (auth) =>
    dataResponse(await deletePlan(auth.userId, uuidSchema.parse((await params).id))),
  );
}
