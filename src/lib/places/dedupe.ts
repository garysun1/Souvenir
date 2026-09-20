import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { places, placeSources } from "@/lib/db/schema";
import type { Database } from "@/lib/server/transactions";
import type { AuthContext, Category } from "../../../shared/api-contract";
import { coordinatesSchema } from "./types";
import { normalizedName } from "./normalize";
import { distanceM, radiusBounds, splitBounds } from "./geo";
import { discoveryPredicate } from "./visibility";

export interface DuplicateInput {
  name: string;
  lat: number;
  lng: number;
  category: Category;
  externalIds?: Record<string, string>;
  wikidataId?: string | null;
}
export interface DuplicateCandidate {
  place: typeof places.$inferSelect;
  reason: "external_identity" | "near_name";
  distanceM: number;
}
function similarName(a: string, b: string): boolean {
  const left = normalizedName(a),
    right = normalizedName(b);
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 8 || Math.abs(left.length - right.length) > 1)
    return false;
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) {
      next[j] = Math.min(
        next[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(left[i - 1] !== right[j - 1]),
      );
    }
    previous = next;
  }
  return previous[right.length] <= 1;
}
export async function findDuplicateCandidates(
  input: DuplicateInput,
  database: Database = db,
  auth?: AuthContext,
): Promise<DuplicateCandidate[]> {
  coordinatesSchema.parse(input);
  if (!input.name.trim() || input.name.length > 200) throw new RangeError("Invalid place name.");
  const visible = or(discoveryPredicate(), auth ? eq(places.ownerId, auth.userId) : undefined);
  const identities = Object.entries(input.externalIds ?? {}).filter(
    ([provider, id]) =>
      ["osm", "wikidata", "google", "curated"].includes(provider) &&
      id.length > 0 &&
      id.length <= 200,
  );
  if (input.wikidataId) identities.push(["wikidata", input.wikidataId]);
  if (identities.length) {
    const rows = await database
      .select()
      .from(places)
      .where(
        and(
          visible,
          or(
            ...identities.map(([provider, id]) => sql`${places.externalIds}->>${provider} = ${id}`),
            input.wikidataId ? eq(places.wikidataId, input.wikidataId) : undefined,
            sql`exists (select 1 from ${placeSources} s where s.place_id = ${places.id} and (${sql.join(
              identities.map(
                ([provider, id]) => sql`(s.provider::text = ${provider} and s.provider_id = ${id})`,
              ),
              sql` or `,
            )}))`,
          ),
        ),
      )
      .limit(25);
    if (rows.length)
      return rows.map((place) => ({
        place,
        reason: "external_identity",
        distanceM: distanceM(input, place),
      }));
  }
  const bounds = radiusBounds(input.lat, input.lng, 150);
  const rows = await database
    .select()
    .from(places)
    .where(
      and(
        visible,
        eq(places.category, input.category),
        sql`${places.lat} between ${bounds.south} and ${bounds.north}`,
        or(
          ...splitBounds(bounds).map(
            (box) => sql`${places.lng} between ${box.west} and ${box.east}`,
          ),
        ),
      ),
    )
    .orderBy(sql`abs(${places.lat} - ${input.lat}) + abs(${places.lng} - ${input.lng})`, places.id)
    .limit(100);
  return rows
    .filter((place) => {
      const distance = distanceM(input, place);
      return (
        distance <= 50 &&
        similarName(place.name, input.name) &&
        (normalizedName(place.name) === normalizedName(input.name) || distance <= 20)
      );
    })
    .map((place) => ({ place, reason: "near_name" as const, distanceM: distanceM(input, place) }))
    .sort((a, b) => a.distanceM - b.distanceM || a.place.id.localeCompare(b.place.id))
    .slice(0, 25);
}
