import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api";
import { wishlistItemRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, wishlistItemRequestSchema);
  if ("response" in parsed) return parsed.response;
  return NextResponse.json({ error: "not_implemented", owner: "Social" }, { status: 501 });
}
