import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { invalidRequest, notFound } from "./errors";
import type { Database } from "./transactions";

export function acceptedFriends(viewerId: string, owner: SQL): SQL {
  return sql`EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND
    ((f.user_id = ${viewerId}::uuid AND f.friend_id = ${owner})
    OR (f.friend_id = ${viewerId}::uuid AND f.user_id = ${owner})))`;
}

export function visibleTo(viewerId: string, owner: SQL, visibility: SQL): SQL {
  return sql`(coalesce(${owner} = ${viewerId}::uuid, false) OR ${visibility} = 'public'
    OR (${visibility} = 'friends' AND ${acceptedFriends(viewerId, owner)}))`;
}

export function visiblePlace(viewerId: string): SQL {
  return visibleTo(viewerId, sql`${places.ownerId}`, sql`${places.visibility}`);
}

export async function requireSocialPlaces(
  viewerId: string,
  ids: string[],
  database: Database = db,
): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const found = await database
    .select({ id: places.id })
    .from(places)
    .where(and(inArray(places.id, unique), visiblePlace(viewerId)));
  if (found.length !== unique.length) invalidRequest("Choose available places.");
}

export async function requireSocialPlace(
  viewerId: string,
  placeId: string,
  database: Database = db,
) {
  const [place] = await database
    .select()
    .from(places)
    .where(and(eq(places.id, placeId), visiblePlace(viewerId)));
  if (!place) notFound("This place is unavailable.");
  return place;
}
