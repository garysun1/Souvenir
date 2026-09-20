import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { editions, places, setPlaces, sets, users } from "@/lib/db/schema";
import { getCurrentUserId } from "@/lib/auth/server";
import type { CollectionSet, Place } from "@/lib/schemas";
import { serializeEditionDto, serializePlace, serializeProfileDto } from "@/lib/serializers";
import { getPlaces, getSets } from "@/lib/server/catalog";
import { getCollection } from "@/lib/server/editions";
import { getPlans } from "@/lib/server/plans";
import { getPlacePreferences, getRankings } from "@/lib/server/rankings";
import { ensureDefaultWishlist, getWishlists } from "@/lib/server/wishlists";
import { lockUser } from "@/lib/server/transactions";
import { placeVisibleTo } from "@/lib/server/place-visibility";
import type { BootstrapDto } from "../../shared/api-contract";
import { withCatalogImages } from "@/lib/server/catalog-images";

export async function getFeaturedPlaces(limit = 6): Promise<Place[]> {
  const rows = await db
    .select()
    .from(places)
    .where(placeVisibleTo())
    .orderBy(asc(places.id))
    .limit(limit);
  return (await withCatalogImages(rows)).map(serializePlace);
}

export async function getCollectionSets(): Promise<CollectionSet[]> {
  const rows = await db.select().from(sets);
  return Promise.all(
    rows.map(async (set) => {
      const members = await db
        .select({ place: places })
        .from(setPlaces)
        .innerJoin(places, eq(setPlaces.placeId, places.id))
        .where(and(eq(setPlaces.setId, set.id), placeVisibleTo()))
        .orderBy(asc(setPlaces.position));
      return {
        id: set.id,
        slug: set.slug,
        name: set.name,
        description: set.description,
        coverImageUrl: set.coverImageUrl,
        city: set.city,
        places: (await withCatalogImages(members.map(({ place }) => place))).map(serializePlace),
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
    .where(and(eq(editions.userId, userId), placeVisibleTo(userId)));
  return Promise.all(
    rows.map(async ({ edition, place }) => ({
      ...edition,
      photoUrl:
        (await serializeEditionDto({ userId, email: null, mode: "cookie" }, edition)).photo?.url ??
        null,
      place: serializePlace(place),
    })),
  );
}

export async function getBootstrap(userId: string): Promise<BootstrapDto> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await ensureDefaultWishlist(tx, userId);
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    const [catalog, collectionSets, collection, lists, rankingState, preferences, plans] =
      await Promise.all([
        getPlaces(undefined, tx, userId),
        getSets(tx, userId),
        getCollection({ userId, email: null, mode: "cookie" }, tx),
        getWishlists(userId, tx),
        getRankings(userId, tx),
        getPlacePreferences(userId, tx),
        getPlans(userId, tx),
      ]);
    return {
      user: serializeProfileDto(user),
      places: catalog,
      sets: collectionSets,
      collection,
      wishlists: lists,
      ...rankingState,
      placePreferences: preferences,
      plans,
    };
  });
}
