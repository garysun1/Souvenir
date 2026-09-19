import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { planRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const parsed = planRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json({ data: await getAiProvider().planOuting(parsed.data) });
}
