import { importItemParamsSchema, memoryVersionSchema } from "@/lib/contracts/memories";
import { completeImportItem } from "@/lib/server/memory-imports";
import { memoryMutation } from "@/lib/server/memory-import-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string; itemId: string }> },
) {
  return memoryMutation(request, memoryVersionSchema, async (auth, input) => {
    const { batchId, itemId } = importItemParamsSchema.parse(await context.params);
    return completeImportItem(auth, batchId, itemId, input);
  });
}
