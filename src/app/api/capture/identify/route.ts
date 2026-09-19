import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api";
import { getAiProvider } from "@/lib/ai";
import { identifyRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, identifyRequestSchema);
  if ("response" in parsed) return parsed.response;
  return NextResponse.json({ data: await getAiProvider().identifyPlace(parsed.data) });
}
