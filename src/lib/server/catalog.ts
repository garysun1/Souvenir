import { asc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { places, setPlaces, sets } from "@/lib/db/schema";
import { serializePlaceDto } from "@/lib/serializers";
import type { PlaceDto, SetDto } from "../../../shared/api-contract";
import { invalidRequest, notFound } from "./errors";
import type { Database } from "./transactions";

export async function getPlaces(q?: string, database: Database = db): Promise<PlaceDto[]> {
  const term = q?.replace(/[\\%_]/g, "\\$&");
  const rows = await database
    .select()
    .from(places)
    .where(
      term
        ? or(ilike(places.name, `%${term}%`), ilike(places.description, `%${term}%`))
        : undefined,
    )
    .orderBy(asc(places.name), asc(places.id));
  return rows.map(serializePlaceDto);
}

export async function getPlace(slug: string): Promise<PlaceDto> {
  const [row] = await db.select().from(places).where(eq(places.slug, slug));
  if (!row) notFound("This place is unavailable.");
  return serializePlaceDto(row);
}

export async function getSets(database: Database = db): Promise<SetDto[]> {
  const rows = await database.select().from(sets).orderBy(asc(sets.name), asc(sets.id));
  const members = await database
    .select({ setId: setPlaces.setId, place: places })
    .from(setPlaces)
    .innerJoin(places, eq(setPlaces.placeId, places.id))
    .orderBy(asc(setPlaces.position), asc(places.id));
  return rows.map((set) => ({
    ...set,
    places: members
      .filter((member) => member.setId === set.id)
      .map(({ place }) => serializePlaceDto(place)),
  }));
}

export async function getSet(slug: string): Promise<SetDto> {
  const set = (await getSets()).find((entry) => entry.slug === slug);
  if (!set) notFound("This set is unavailable.");
  return set;
}

export async function requirePlaces(database: Database, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const rows = await database
    .select({ id: places.id })
    .from(places)
    .where(inArray(places.id, unique));
  if (rows.length !== unique.length) invalidRequest("Choose places from the current catalog.");
}
