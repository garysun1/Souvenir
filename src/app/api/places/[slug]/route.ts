import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { serializePlace } from "@/lib/serializers";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [row] = await db.select().from(places).where(eq(places.slug, slug)).limit(1);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: serializePlace(row) });
}
