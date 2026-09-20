import { dataResponse, withApiUser, type IdParams } from "@/lib/api";
import { uuidSchema } from "@/lib/contracts/api";
import { getEditionPhoto } from "@/lib/server/editions";

export async function GET(request: Request, { params }: IdParams) {
  return withApiUser(request, async (auth) =>
    dataResponse(await getEditionPhoto(auth, uuidSchema.parse((await params).id))),
  );
}
