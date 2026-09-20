import { tasteAnalyzeSchema } from "@/lib/contracts/memories";
import { analyzeTaste } from "@/lib/server/taste";
import { memoryMutation } from "@/lib/server/memory-import-api";

export const maxDuration = 120;

export async function POST(request: Request) {
  return memoryMutation(request, tasteAnalyzeSchema, analyzeTaste);
}
