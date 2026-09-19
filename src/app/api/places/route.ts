import { ilike, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { serializePlace } from "@/lib/serializers";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const rows = await db.select().from(places).where(q ? or(ilike(places.name, `%${q}%`), ilike(places.description, `%${q}%`)) : undefined).limit(100);
  return NextResponse.json({ data: rows.map(serializePlace) });
}
