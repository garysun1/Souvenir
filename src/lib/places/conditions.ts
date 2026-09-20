import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { places, friendships } from "@/lib/db/schema";
import { notFound } from "@/lib/server/errors";
import type { Database } from "@/lib/server/transactions";
import type { AuthContext } from "../../../shared/api-contract";
import { getDocumentedAvailability } from "./store";

export async function getPlaceConditions(auth: AuthContext, slug: string, database: Database = db) {
  const [place] = await database
    .select({ id: places.id })
    .from(places)
    .where(
      and(
        eq(places.slug, slug),
        or(
          eq(places.visibility, "public"),
          eq(places.ownerId, auth.userId),
          and(
            eq(places.visibility, "friends"),
            sql`exists(select 1 from ${friendships} f where f.status = 'accepted'
        and ((f.user_id = ${auth.userId} and f.friend_id = ${places.ownerId})
          or (f.friend_id = ${auth.userId} and f.user_id = ${places.ownerId})))`,
          ),
        ),
      ),
    );
  if (!place) notFound("This place is unavailable.");
  return {
    availability: await getDocumentedAvailability(place.id, database),
    openNow: null,
    weather: null,
    crowdLevel: null,
    price: null,
  };
}
