import { and, eq, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { places } from "@/lib/db/schema";
import { notFound } from "./errors";
import type { Database } from "./transactions";

export function acceptedFriendOf(owner: SQLWrapper, viewerId: string): SQL {
  return sql`exists (
    select 1 from friendships f where f.status = 'accepted'
    and ((f.user_id = ${viewerId} and f.friend_id = ${owner})
      or (f.friend_id = ${viewerId} and f.user_id = ${owner}))
  )`;
}

export function visibleTo(visibility: SQLWrapper, owner: SQLWrapper, viewerId?: string): SQL {
  if (!viewerId) return sql`${visibility} = 'public'`;
  return sql`(${visibility} = 'public' or ${owner} = ${viewerId}
    or (${visibility} = 'friends' and ${acceptedFriendOf(owner, viewerId)}))`;
}

export function placeVisibleTo(viewerId?: string): SQL {
  return visibleTo(places.visibility, places.ownerId, viewerId);
}

export async function requireVisiblePlace(
  database: Database,
  slug: string,
  viewerId?: string,
): Promise<typeof places.$inferSelect> {
  const [place] = await database
    .select()
    .from(places)
    .where(and(eq(places.slug, slug), placeVisibleTo(viewerId)));
  if (!place) notFound("This place is unavailable.");
  return place;
}

export function longitudeBounds(west: number, east: number): SQL | undefined {
  return west > east
    ? or(sql`${places.lng} >= ${west}`, sql`${places.lng} <= ${east}`)
    : and(sql`${places.lng} >= ${west}`, sql`${places.lng} <= ${east}`);
}
