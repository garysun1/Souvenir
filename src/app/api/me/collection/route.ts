import { dataResponse, withApiUser } from "@/lib/api";
import { getCollection } from "@/lib/server/editions";

export async function GET(request: Request) {
  return withApiUser(request, async (auth) => dataResponse(await getCollection(auth)));
}
