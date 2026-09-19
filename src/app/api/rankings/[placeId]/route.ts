import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api";
import { rankingRequestSchema } from "@/lib/schemas";

export async function PUT(request: Request) {
  const parsed = await parseJsonBody(request, rankingRequestSchema);
  if ("response" in parsed) return parsed.response;
  return NextResponse.json(
    { error: "not_implemented", owner: "Collection & Map" },
    { status: 501 },
  );
}
