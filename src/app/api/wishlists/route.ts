import { NextResponse } from "next/server";
import { wishlistCreateRequestSchema } from "@/lib/schemas";

export async function GET() {
  return NextResponse.json({ error: "not_implemented", owner: "Social" }, { status: 501 });
}
export async function POST(request: Request) {
  const parsed = wishlistCreateRequestSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  return NextResponse.json({ error: "not_implemented", owner: "Social" }, { status: 501 });
}
