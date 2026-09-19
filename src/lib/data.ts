import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { editions, places, setPlaces, sets } from "@/lib/db/schema";
import { getCurrentUserId } from "@/lib/auth/server";
import type { CollectionSet, Place } from "@/lib/schemas";
import { serializePlace } from "@/lib/serializers";

export async function getFeaturedPlaces(limit = 6): Promise<Place[]> {
  const rows = await db.select().from(places).limit(limit);
  return rows.map(serializePlace);
}

export async function getCollectionSets(): Promise<CollectionSet[]> {
  const rows = await db.select().from(sets);
  return Promise.all(
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
}

export async function getCurrentCollection() {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const rows = await db
    .select({ edition: editions, place: places })
    .from(editions)
    .innerJoin(places, eq(editions.placeId, places.id))
    .where(eq(editions.userId, userId));
  return rows.map(({ edition, place }) => ({ ...edition, place: serializePlace(place) }));
}
