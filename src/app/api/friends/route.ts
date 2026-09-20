import { dataResponse, withApiUser } from "@/lib/api";
import { getFriends } from "@/lib/server/social";

export async function GET(request: Request) {
  return withApiUser(request, async (auth) => dataResponse(await getFriends(auth.userId)));
}
