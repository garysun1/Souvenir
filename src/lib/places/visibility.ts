import { and, eq, ne, or, sql } from "drizzle-orm";
import { places } from "@/lib/db/schema";

export function discoveryPredicate() {
  return and(
    eq(places.visibility, "public"),
    or(ne(places.source, "user"), sql`${places.stats}->'verified' = 'true'::jsonb`),
  );
}
