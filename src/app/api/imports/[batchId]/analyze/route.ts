import { importBatchParamsSchema, importAnalyzeSchema } from "@/lib/contracts/memories";
import { analyzeImport } from "@/lib/server/memory-imports";
import { memoryMutation } from "@/lib/server/memory-import-api";

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  return memoryMutation(request, importAnalyzeSchema, async (auth, input) => {
    const { batchId } = importBatchParamsSchema.parse(await context.params);
    return analyzeImport(auth, batchId, input);
  });
}
