import { dataResponse, parseJsonBody, withApiUser, type IdParams } from "@/lib/api";
import { editionPatchSchema, uuidSchema } from "@/lib/contracts/api";
import { deleteEdition, getEdition, updateEdition } from "@/lib/server/editions";

export async function GET(request: Request, { params }: IdParams) {
  return withApiUser(request, async (auth) =>
    dataResponse(await getEdition(auth, uuidSchema.parse((await params).id))),
  );
}

export async function PATCH(request: Request, { params }: IdParams) {
  return withApiUser(request, async (auth) => {
    const id = uuidSchema.parse((await params).id);
    const parsed = await parseJsonBody(request, editionPatchSchema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await updateEdition(auth, id, parsed.data));
  });
}

export async function DELETE(request: Request, { params }: IdParams) {
  return withApiUser(request, async (auth) =>
    dataResponse(await deleteEdition(auth, uuidSchema.parse((await params).id))),
  );
}
