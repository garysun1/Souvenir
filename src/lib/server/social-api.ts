import { z } from "zod";
import { apiRoute } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/server";
import type { AuthContext } from "../../../shared/api-contract";

export function socialQueryRoute<T>(
  request: Request,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  handler: (auth: AuthContext, query: T) => Promise<Response>,
) {
  return apiRoute(async () => {
    const result = await requireApiUser(request);
    if ("response" in result) return result.response;
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) {
      if (params.getAll(key).length > 1) {
        throw new z.ZodError([
          { code: "custom", path: [key], message: "Supply each parameter once" },
        ]);
      }
    }
    return handler(result.auth, schema.parse(Object.fromEntries(params)));
  });
}
