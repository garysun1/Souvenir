import { NextResponse } from "next/server";
import { rankingRequestSchema } from "@/lib/schemas";

export async function PUT(request: Request) {
  const parsed = rankingRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json({ error: "not_implemented", owner: "Collection & Map" }, { status: 501 });
}
