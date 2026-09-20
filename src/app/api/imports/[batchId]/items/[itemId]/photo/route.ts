import { dataResponse, withApiUser } from "@/lib/api";
import { importItemParamsSchema } from "@/lib/contracts/memories";
import { getImportPhoto } from "@/lib/server/memory-imports";

export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string; itemId: string }> },
) {
  return withApiUser(request, async (auth) => {
    const { batchId, itemId } = importItemParamsSchema.parse(await context.params);
    return dataResponse(await getImportPhoto(auth, batchId, itemId));
  });
}
