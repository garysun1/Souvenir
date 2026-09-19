import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { places, setPlaces, sets } from "@/lib/db/schema";
import { serializePlace } from "@/lib/serializers";

export async function GET() {
  const rows = await db.select().from(sets);
  const data = await Promise.all(
    rows.map(async (set) => {
      const members = await db
        .select({ place: places })
        .from(setPlaces)
        .innerJoin(places, eq(setPlaces.placeId, places.id))
        .where(eq(setPlaces.setId, set.id))
        .orderBy(asc(setPlaces.position));
      return {
        id: set.id,
        slug: set.slug,
        name: set.name,
        description: set.description,
        coverImageUrl: set.coverImageUrl,
        city: set.city,
        places: members.map(({ place }) => serializePlace(place)),
      };
    }),
  );
  return NextResponse.json({ data });
}
