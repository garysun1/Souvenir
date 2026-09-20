import {
  importItemParamsSchema,
  importItemPatchSchema,
  memoryVersionSchema,
} from "@/lib/contracts/memories";
import { deleteImport, patchImportItem } from "@/lib/server/memory-imports";
import { memoryMutation } from "@/lib/server/memory-import-api";

type Context = { params: Promise<{ batchId: string; itemId: string }> };

export async function PATCH(request: Request, context: Context) {
  return memoryMutation(request, importItemPatchSchema, async (auth, input) => {
    const { batchId, itemId } = importItemParamsSchema.parse(await context.params);
    return patchImportItem(auth, batchId, itemId, input);
  });
}

export async function DELETE(request: Request, context: Context) {
  return memoryMutation(request, memoryVersionSchema, async (auth, input) => {
    const { batchId, itemId } = importItemParamsSchema.parse(await context.params);
    return deleteImport(auth, batchId, itemId, input);
  });
}
