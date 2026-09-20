import { z } from "zod";
import { apiRoute, dataResponse } from "@/lib/api";
import { getPlaces } from "@/lib/server/catalog";

const querySchema = z.object({ q: z.string().trim().max(200).optional() }).strict();

export async function GET(request: Request) {
  return apiRoute(async () => {
    const params = new URL(request.url).searchParams;
    if (params.getAll("q").length > 1)
      throw new z.ZodError([{ code: "custom", path: ["q"], message: "Supply one search term" }]);
    const { q } = querySchema.parse(Object.fromEntries(params));
    return dataResponse(await getPlaces(q));
  });
}
