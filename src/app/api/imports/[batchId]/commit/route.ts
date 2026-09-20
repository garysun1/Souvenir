import { importBatchParamsSchema, importCommitSchema } from "@/lib/contracts/memories";
import { commitImport } from "@/lib/server/memory-imports";
import { memoryMutation } from "@/lib/server/memory-import-api";

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  return memoryMutation(request, importCommitSchema, async (auth, input) => {
    const { batchId } = importBatchParamsSchema.parse(await context.params);
    return commitImport(auth, batchId, input);
  });
}
