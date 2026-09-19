import { NextResponse } from "next/server";
import { getSearchService } from "@/lib/search";
import { searchQuerySchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const parsed = searchQuerySchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  return NextResponse.json({ data: await getSearchService().search(parsed.data) });
}
