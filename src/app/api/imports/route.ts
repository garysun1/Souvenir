import { importBatchCreateSchema, memoryPageQuerySchema } from "@/lib/contracts/memories";
import { createImportBatch, listImportBatches } from "@/lib/server/memory-imports";
import { memoryMutation, memoryQuery } from "@/lib/server/memory-import-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return memoryQuery(request, memoryPageQuerySchema, listImportBatches);
}

export async function POST(request: Request) {
  return memoryMutation(request, importBatchCreateSchema, createImportBatch, 201);
}
