import { dataResponse, withApiUser } from "@/lib/api";
import { getBootstrap } from "@/lib/data";

export async function GET(request: Request) {
  return withApiUser(request, async (auth) => dataResponse(await getBootstrap(auth.userId)));
}
