import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "not_implemented", owner: "Search & Data" }, { status: 501 });
}
