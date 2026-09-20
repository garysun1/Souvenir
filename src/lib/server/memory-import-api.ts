import { z } from "zod";
import { apiRoute, dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/server";
import type { AuthContext } from "../../../shared/api-contract";
import { invalidRequest } from "./errors";

export function memoryMutation<S extends z.ZodType>(
  request: Request,
  schema: S,
  handler: (auth: AuthContext, input: z.output<S>) => Promise<unknown>,
  status = 200,
) {
  return withApiUser(request, async (auth) => {
    const parsed = await parseJsonBody(request, schema);
    if ("response" in parsed) return parsed.response;
    return dataResponse(await handler(auth, parsed.data), status);
  });
}

export function memoryQuery<S extends z.ZodType>(
  request: Request,
  schema: S,
  handler: (auth: AuthContext, query: z.output<S>) => Promise<unknown>,
) {
  return apiRoute(async () => {
    const result = await requireApiUser(request);
    if ("response" in result) return result.response;
    const search = new URL(request.url).searchParams;
    for (const key of search.keys()) {
      if (search.getAll(key).length > 1) invalidRequest("Supply each filter once.");
    }
    return dataResponse(await handler(result.auth, schema.parse(Object.fromEntries(search))));
  });
}
