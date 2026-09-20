import { apiRoute, createdResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/server";
import { placeCreateSchema } from "@/lib/contracts/api";
import { getPlacePage, parseCatalogQuery } from "@/lib/server/catalog";
import { createPlace, DuplicatePlaceError } from "@/lib/server/place-metadata";

export async function GET(request: Request) {
  return apiRoute(async () => {
    const result = await requireApiUser(request);
    if ("response" in result && request.headers.has("authorization")) return result.response;
    const viewerId = "auth" in result ? result.auth.userId : undefined;
    return Response.json(await getPlacePage(viewerId, parseCatalogQuery(request)));
  });
}

export async function POST(request: Request) {
  return withApiUser(request, async (auth) => {
    const body = await parseJsonBody(request, placeCreateSchema);
    if ("response" in body) return body.response;
    try {
      return createdResponse(await createPlace(auth.userId, body.data));
    } catch (error) {
      if (error instanceof DuplicatePlaceError)
        return Response.json(
          {
            error: error.code,
            message: error.message,
            details: { kind: "duplicate", existingPlace: error.place },
          },
          { status: 409 },
        );
      throw error;
    }
  });
}
