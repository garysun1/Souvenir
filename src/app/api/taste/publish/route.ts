import { tastePublishSchema } from "@/lib/contracts/memories";
import { publishTaste } from "@/lib/server/taste";
import { memoryMutation } from "@/lib/server/memory-import-api";

export async function POST(request: Request) {
  return memoryMutation(request, tastePublishSchema, publishTaste);
}
