import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { places, setPlaces, sets } from "@/lib/db/schema";
import { serializePlace } from "@/lib/serializers";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [set] = await db.select().from(sets).where(eq(sets.slug, slug)).limit(1);
  if (!set) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const members = await db
    .select({ place: places })
    .from(setPlaces)
    .innerJoin(places, eq(setPlaces.placeId, places.id))
    .where(and(eq(setPlaces.setId, set.id)))
    .orderBy(setPlaces.position);
  return NextResponse.json({
    data: {
      id: set.id,
      slug: set.slug,
      name: set.name,
      description: set.description,
      coverImageUrl: set.coverImageUrl,
      city: set.city,
      places: members.map(({ place }) => serializePlace(place)),
    },
  });
}
