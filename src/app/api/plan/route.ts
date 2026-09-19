import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api";
import { getAiProvider } from "@/lib/ai";
import { planRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, planRequestSchema);
  if ("response" in parsed) return parsed.response;
  return NextResponse.json({ data: await getAiProvider().planOuting(parsed.data) });
}
