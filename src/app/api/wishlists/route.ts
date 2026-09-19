import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api";
import { wishlistCreateRequestSchema } from "@/lib/schemas";

export async function GET() {
  return NextResponse.json({ error: "not_implemented", owner: "Social" }, { status: 501 });
}
export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, wishlistCreateRequestSchema);
  if ("response" in parsed) return parsed.response;
  return NextResponse.json({ error: "not_implemented", owner: "Social" }, { status: 501 });
}
