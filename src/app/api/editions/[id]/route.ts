import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "not_implemented", owner: "Capture & Reveal" }, { status: 501 });
}
