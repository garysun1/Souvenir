import "server-only";
import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, places } from "@/lib/db/schema";
import type { AuthContext } from "../../../shared/api-contract";
import type {
  TasteComparisonDto,
  TasteComparisonQuery,
  TasteInterest,
  TasteSharedProfileDto,
} from "../../../shared/memories-contract";
import { compareTaste } from "../../../shared/taste";
import { currentTaste } from "./taste";
import { serializeCatalogPlace } from "./catalog";
import { notFound } from "./errors";
import { placeVisibleTo } from "./place-visibility";
import { lockUser, type Transaction } from "./transactions";

async function requireFriend(tx: Transaction, userId: string, friendId: string) {
  if (userId === friendId) notFound();
  const [friend] = await tx
    .select({ userId: friendships.userId })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(
          and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
          and(eq(friendships.friendId, userId), eq(friendships.userId, friendId)),
        ),
      ),
    )
    .for("share");
  if (!friend) notFound("This shared taste profile is unavailable.");
}

async function sharedProfile(
  tx: Transaction,
  userId: string,
): Promise<TasteSharedProfileDto | null> {
  const { row } = await currentTaste(tx, userId);
  if (row.sharing !== "friends" || !row.published) return null;
  return { userId, version: row.version, published: row.published };
}

export async function getSharedTaste(
  auth: AuthContext,
  userId: string,
): Promise<TasteSharedProfileDto> {
  const profile = await db.transaction(async (tx) => {
    for (const id of [...new Set([auth.userId, userId])].sort()) await lockUser(tx, id);
    await requireFriend(tx, auth.userId, userId);
    return sharedProfile(tx, userId);
  });
  if (!profile) notFound("This shared taste profile is unavailable.");
  return profile;
}

const placeTerms: Record<TasteInterest, RegExp> = {
  gardens: /\b(garden|gardens|botanical)\b/i,
  architecture: /\b(architecture|architectural|building|buildings|tower|towers)\b/i,
  museums: /\b(museum|museums)\b/i,
  street_food: /\b(street food|food stall|food truck)\b/i,
  waterfronts: /\b(waterfront|harbor|harbour|pier|riverfront)\b/i,
  hiking: /\b(hike|hiking|trail|trails)\b/i,
  beaches: /\b(beach|beaches|coast|coastal)\b/i,
  parks: /\b(park|parks)\b/i,
  art: /\b(art|gallery|galleries|sculpture)\b/i,
  history: /\b(history|historic|historical|heritage)\b/i,
  cafes: /\b(cafe|cafes|café|cafés|coffee)\b/i,
  markets: /\b(market|markets|bazaar)\b/i,
  live_music: /\b(live music|concert|concerts|jazz)\b/i,
  theater: /\b(theater|theatre|theatrical)\b/i,
  local_food: /\b(restaurant|restaurants|local food|cuisine)\b/i,
  photography: /\b(photography|photographic|photo spot)\b/i,
  scenic_views: /\b(scenic|viewpoint|panorama|lookout)\b/i,
  wildlife: /\b(wildlife|birdwatching|nature reserve)\b/i,
  cycling: /\b(cycling|bicycle|bike|biking)\b/i,
  bookshops: /\b(bookshop|bookshops|bookstore|bookstores)\b/i,
};

export function matchPlaceInterests(
  place: { name: string; description: string; category: string },
  interests: TasteInterest[],
) {
  const text = `${place.name} ${place.category} ${place.description}`;
  return interests.filter((interest) => placeTerms[interest].test(text));
}

export async function getTasteComparison(
  auth: AuthContext,
  userId: string,
  query: TasteComparisonQuery,
): Promise<TasteComparisonDto> {
  const result = await db.transaction(async (tx) => {
    for (const id of [...new Set([auth.userId, userId])].sort()) await lockUser(tx, id);
    await requireFriend(tx, auth.userId, userId);
    const own = await sharedProfile(tx, auth.userId);
    const friend = await sharedProfile(tx, userId);
    if (!own || !friend) return null;
    const comparison = compareTaste(own.published.facets, friend.published.facets);
    const suggestions: TasteComparisonDto["suggestions"] = [];
    if (comparison.coverage === "ready" && comparison.commonInterests.length) {
      const candidates = await tx
        .select()
        .from(places)
        .where(
          and(
            placeVisibleTo(auth.userId),
            placeVisibleTo(userId),
            query.city ? eq(places.city, query.city) : undefined,
            query.country ? eq(places.country, query.country) : undefined,
          ),
        )
        .orderBy(asc(places.name), asc(places.id))
        .limit(200);
      for (const place of candidates) {
        const matchedInterests = matchPlaceInterests(place, comparison.commonInterests);
        if (!matchedInterests.length) continue;
        suggestions.push({
          place: serializeCatalogPlace(place),
          matchedInterests,
          reason: `The catalog describes ${matchedInterests.map((v) => v.replaceAll("_", " ")).join(" and ")} you both shared.`,
        });
        if (suggestions.length === 2) break;
      }
    }
    return { ...comparison, suggestions };
  });
  if (!result) notFound("Both friends must share a taste profile to compare.");
  return result;
}
