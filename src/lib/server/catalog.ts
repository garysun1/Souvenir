import { and, asc, eq, gt, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { places, setPlaces, sets } from "@/lib/db/schema";
import { serializePlaceDto } from "@/lib/serializers";
import { placeListQuerySchema, uuidSchema } from "@/lib/contracts/api";
import type { PlaceDto, SetDto } from "../../../shared/api-contract";
import { invalidRequest, notFound } from "./errors";
import { longitudeBounds, placeVisibleTo, requireVisiblePlace } from "./place-visibility";
import type { Database } from "./transactions";

export function serializeCatalogPlace(row: typeof places.$inferSelect): PlaceDto {
  return serializePlaceDto(row);
}

export async function getPlaces(
  q?: string,
  database: Database = db,
  viewerId?: string,
): Promise<PlaceDto[]> {
  const term = q?.replace(/[\\%_]/g, "\\$&");
  const rows = await database
    .select()
    .from(places)
    .where(
      and(
        placeVisibleTo(viewerId),
        term
          ? or(ilike(places.name, `%${term}%`), ilike(places.description, `%${term}%`))
          : undefined,
      ),
    )
    .orderBy(asc(places.name), asc(places.id));
  return rows.map(serializeCatalogPlace);
}

const cursorSchema = z.object({ name: z.string().max(200), id: uuidSchema }).strict();
export type CatalogQuery = z.output<typeof placeListQuerySchema> & { cursor?: string };

export function parseCatalogQuery(request: Request): CatalogQuery {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (params.getAll(key).length !== 1) invalidRequest("Supply each filter once.");
  }
  const { cursor, ...filters } = Object.fromEntries(params);
  if (cursor !== undefined) decodeCursor(cursor);
  return { ...placeListQuerySchema.parse(filters), cursor };
}

function decodeCursor(cursor: string): z.output<typeof cursorSchema> {
  try {
    if (!/^[A-Za-z0-9_-]{1,1024}$/.test(cursor)) throw new Error();
    return cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    invalidRequest("Invalid catalog cursor.");
  }
}

export async function getPlacePage(viewerId: string | undefined, query: CatalogQuery) {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const term = query.q?.replace(/[\\%_]/g, "\\$&");
  const limit = query.limit ?? 100;
  const rows = await db
    .select()
    .from(places)
    .where(
      and(
        placeVisibleTo(viewerId),
        term
          ? or(ilike(places.name, `%${term}%`), ilike(places.description, `%${term}%`))
          : undefined,
        query.city ? eq(places.city, query.city) : undefined,
        query.country ? eq(places.country, query.country) : undefined,
        query.category ? eq(places.category, query.category) : undefined,
        query.south !== undefined
          ? and(
              gte(places.lat, query.south),
              lte(places.lat, query.north!),
              longitudeBounds(query.west!, query.east!),
            )
          : undefined,
        cursor
          ? or(
              gt(places.name, cursor.name),
              and(eq(places.name, cursor.name), gt(places.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(asc(places.name), asc(places.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    data: page.map(serializeCatalogPlace),
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(JSON.stringify({ name: last.name, id: last.id })).toString("base64url")
        : null,
  };
}

export async function getPlace(slug: string, viewerId?: string): Promise<PlaceDto> {
  return serializeCatalogPlace(await requireVisiblePlace(db, slug, viewerId));
}

export async function getSets(database: Database = db, viewerId?: string): Promise<SetDto[]> {
  const rows = await database.select().from(sets).orderBy(asc(sets.name), asc(sets.id));
  const members = await database
    .select({ setId: setPlaces.setId, place: places })
    .from(setPlaces)
    .innerJoin(places, eq(setPlaces.placeId, places.id))
    .where(placeVisibleTo(viewerId))
    .orderBy(asc(setPlaces.position), asc(places.id));
  return rows.map((set) => ({
    ...set,
    places: members
      .filter((member) => member.setId === set.id)
      .map(({ place }) => serializeCatalogPlace(place)),
  }));
}

export async function getSet(slug: string, viewerId?: string): Promise<SetDto> {
  const set = (await getSets(db, viewerId)).find((entry) => entry.slug === slug);
  if (!set) notFound("This set is unavailable.");
  return set;
}

export async function requirePlaces(
  database: Database,
  ids: string[],
  viewerId?: string,
): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const rows = await database
    .select({ id: places.id })
    .from(places)
    .where(and(inArray(places.id, unique), placeVisibleTo(viewerId)));
  if (rows.length !== unique.length) invalidRequest("Choose places from the current catalog.");
}
