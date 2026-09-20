import { importBatchParamsSchema, importItemCreateSchema } from "@/lib/contracts/memories";
import { registerImportItem } from "@/lib/server/memory-imports";
import { memoryMutation } from "@/lib/server/memory-import-api";

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  return memoryMutation(
    request,
    importItemCreateSchema,
    async (auth, input) => {
      const { batchId } = importBatchParamsSchema.parse(await context.params);
      return registerImportItem(auth, batchId, input);
    },
    201,
  );
}
