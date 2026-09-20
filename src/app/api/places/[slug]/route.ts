import { apiRoute, dataResponse, requireNoQuery, slugSchema, type SlugParams } from "@/lib/api";
import { getPlace } from "@/lib/server/catalog";

export async function GET(request: Request, { params }: SlugParams) {
  return apiRoute(async () => {
    requireNoQuery(request);
    return dataResponse(await getPlace(slugSchema.parse((await params).slug)));
  });
}
