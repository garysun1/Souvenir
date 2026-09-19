import { NextResponse } from "next/server";
import { editionCreateRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const parsed = editionCreateRequestSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  return NextResponse.json(
    { error: "not_implemented", owner: "Capture & Reveal" },
    { status: 501 },
  );
}
