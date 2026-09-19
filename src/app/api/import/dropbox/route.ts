import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "not_implemented", owner: "Dropbox" }, { status: 501 });
}
