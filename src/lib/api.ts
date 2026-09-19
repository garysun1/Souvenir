import { NextResponse } from "next/server";
import type { z } from "zod";

export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: NextResponse.json({ error: "invalid_json" }, { status: 400 }) };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: "invalid_request", details: parsed.error.flatten() },
        { status: 400 },
      ),
    };
  }
  return { data: parsed.data };
}
