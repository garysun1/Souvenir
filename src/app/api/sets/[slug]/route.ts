import { apiRoute, dataResponse, requireNoQuery, slugSchema, type SlugParams } from "@/lib/api";
import { getSet } from "@/lib/server/catalog";

export async function GET(request: Request, { params }: SlugParams) {
  return apiRoute(async () => {
    requireNoQuery(request);
    return dataResponse(await getSet(slugSchema.parse((await params).slug)));
  });
}
