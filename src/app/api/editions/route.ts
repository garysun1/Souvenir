import { createdResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { editionCreateSchema } from "@/lib/contracts/api";
import { createEdition } from "@/lib/server/editions";

export async function POST(request: Request) {
  return withApiUser(request, async (auth) => {
    const parsed = await parseJsonBody(request, editionCreateSchema);
    if ("response" in parsed) return parsed.response;
    return createdResponse(await createEdition(auth, parsed.data));
  });
}
