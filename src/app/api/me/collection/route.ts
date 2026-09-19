import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { editions, places } from "@/lib/db/schema";
import { getCurrentUserId } from "@/lib/auth/server";
import { serializePlace } from "@/lib/serializers";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ data: [] });
  const rows = await db.select({ edition: editions, place: places }).from(editions).innerJoin(places, eq(editions.placeId, places.id)).where(eq(editions.userId, userId));
  return NextResponse.json({ data: rows.map(({ edition, place }) => ({ ...edition, place: serializePlace(place) })) });
}
