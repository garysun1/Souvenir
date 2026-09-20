import { apiRoute, dataResponse, requireNoQuery } from "@/lib/api";
import { getSets } from "@/lib/server/catalog";

export async function GET(request: Request) {
  return apiRoute(async () => {
    requireNoQuery(request);
    return dataResponse(await getSets());
  });
}
