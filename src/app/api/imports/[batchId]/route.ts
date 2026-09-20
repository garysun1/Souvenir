import { dataResponse, withApiUser } from "@/lib/api";
import { importBatchParamsSchema, memoryVersionSchema } from "@/lib/contracts/memories";
import { deleteImport, getImportBatch } from "@/lib/server/memory-imports";
import { memoryMutation } from "@/lib/server/memory-import-api";

type Context = { params: Promise<{ batchId: string }> };

export async function GET(request: Request, context: Context) {
  return withApiUser(request, async (auth) => {
    const { batchId } = importBatchParamsSchema.parse(await context.params);
    return dataResponse(await getImportBatch(auth, batchId));
  });
}

export async function DELETE(request: Request, context: Context) {
  return memoryMutation(request, memoryVersionSchema, async (auth, input) => {
    const { batchId } = importBatchParamsSchema.parse(await context.params);
    return deleteImport(auth, batchId, null, input);
  });
}
