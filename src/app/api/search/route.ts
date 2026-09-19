import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api";
import { getSearchService } from "@/lib/search";
import { searchQuerySchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, searchQuerySchema);
  if ("response" in parsed) return parsed.response;
  return NextResponse.json({ data: await getSearchService().search(parsed.data) });
}
