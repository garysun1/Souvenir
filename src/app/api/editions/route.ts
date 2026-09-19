import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api";
import { editionCreateRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, editionCreateRequestSchema);
  if ("response" in parsed) return parsed.response;
  return NextResponse.json(
    { error: "not_implemented", owner: "Capture & Reveal" },
    { status: 501 },
  );
}
