import { dataResponse, withApiUser } from "@/lib/api";
import { memoryVersionSchema, tasteProfilePatchSchema } from "@/lib/contracts/memories";
import { deleteTaste, getTaste, patchTaste } from "@/lib/server/taste";
import { memoryMutation } from "@/lib/server/memory-import-api";

export async function GET(request: Request) {
  return withApiUser(request, async (auth) => dataResponse(await getTaste(auth)));
}

export async function PATCH(request: Request) {
  return memoryMutation(request, tasteProfilePatchSchema, patchTaste);
}

export async function DELETE(request: Request) {
  return memoryMutation(request, memoryVersionSchema, deleteTaste);
}
