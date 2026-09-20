import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiRequests, placeNotes, places, placeSuggestions, placeTags } from "@/lib/db/schema";
import {
  placeCreateSchema,
  placeNoteCreateSchema,
  placeNotePatchSchema,
  placeSuggestionSchema,
  placeTagPutSchema,
} from "@/lib/contracts/api";
import type {
  PlaceCreate,
  PlaceDto,
  PlaceNoteCreate,
  PlaceNoteDto,
  PlaceNotePatch,
  PlaceSuggestionCreate,
  PlaceSuggestionDto,
  PlaceTagPut,
  PlaceTagsDto,
} from "../../../shared/api-contract";
import { serializeCatalogPlace } from "./catalog";
import { ApiError, invalidRequest, notFound } from "./errors";
import { syncNoteActivity } from "./activity";
import { placeVisibleTo, requireVisiblePlace, visibleTo } from "./place-visibility";
import {
  completeRequest,
  deletedResource,
  lockUser,
  reserveRequest,
  type Created,
  type Database,
} from "./transactions";

export class DuplicatePlaceError extends ApiError {
  constructor(readonly place: PlaceDto) {
    super(
      409,
      "conflict",
      "A matching place is already available. Confirm the place before continuing.",
    );
  }
}

function normalizedName(name: string): string {
  return name.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

export async function createPlace(userId: string, input: PlaceCreate): Promise<Created<PlaceDto>> {
  const parsed = placeCreateSchema.parse(input);
  const normalized = {
    ...parsed,
    city: parsed.city ?? null,
    country: parsed.country ?? null,
    region: parsed.region ?? null,
    timezone: parsed.timezone ?? null,
    website: parsed.website ?? null,
    description: parsed.description ?? "",
    visibility: parsed.visibility ?? "private",
  };
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const request = await reserveRequest(tx, userId, parsed.requestId, "place.create", normalized);
    if (request.resourceId) {
      const [row] = await tx
        .select()
        .from(places)
        .where(and(eq(places.id, request.resourceId), eq(places.ownerId, userId)));
      if (!row) deletedResource();
      return { data: serializeCatalogPlace(row), created: false };
    }
    const name = normalizedName(parsed.name);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`custom-place:${name}`}, 0))`,
    );
    const candidates = await tx
      .select()
      .from(places)
      .where(
        and(
          placeVisibleTo(userId),
          eq(places.category, parsed.category),
          sql`lower(regexp_replace(btrim(normalize(${places.name}, NFKC)), '\\s+', ' ', 'g')) = ${name}`,
          sql`${places.lat} between ${parsed.lat - 0.001} and ${parsed.lat + 0.001}`,
          sql`6371000 * 2 * asin(least(1, sqrt(
        power(sin(radians(${places.lat} - ${parsed.lat}) / 2), 2) +
        cos(radians(${parsed.lat})) * cos(radians(${places.lat})) *
        power(sin(radians(${places.lng} - ${parsed.lng}) / 2), 2)
      ))) <= 75`,
        ),
      )
      .orderBy(asc(places.id))
      .limit(1);
    if (candidates[0]) throw new DuplicatePlaceError(serializeCatalogPlace(candidates[0]));
    const id = randomUUID();
    const slugName =
      name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 160)
        .replace(/-$/g, "") || "place";
    const [row] = await tx
      .insert(places)
      .values({
        ...normalized,
        id,
        slug: `${slugName}-${id}`,
        ownerId: userId,
        source: "user",
        rarityTier: "common",
        rarityAppeal: 0,
        rarityDiscoveryFreq: 0,
        rarityAvailability: 0,
        stats: { verified: false, provenance: "user-contributed", rarityStatus: "unavailable" },
      })
      .returning();
    await completeRequest(tx, userId, parsed.requestId, row.id);
    return { data: serializeCatalogPlace(row), created: true };
  });
}

export function serializePlaceNote(row: typeof placeNotes.$inferSelect): PlaceNoteDto {
  return {
    id: row.id,
    placeId: row.placeId,
    userId: row.userId,
    kind: row.kind,
    body: row.body,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getPlaceNotes(
  userId: string,
  slug: string,
  database: Database = db,
  ownOnly = false,
): Promise<PlaceNoteDto[]> {
  const place = await requireVisiblePlace(database, slug, userId);
  const rows = await database
    .select()
    .from(placeNotes)
    .where(
      and(
        eq(placeNotes.placeId, place.id),
        visibleTo(placeNotes.visibility, placeNotes.userId, userId),
        ownOnly ? eq(placeNotes.userId, userId) : undefined,
      ),
    )
    .orderBy(desc(placeNotes.createdAt), desc(placeNotes.id))
    .limit(100);
  return rows.map(serializePlaceNote);
}

export async function createPlaceNote(
  userId: string,
  slug: string,
  input: PlaceNoteCreate,
): Promise<Created<PlaceNoteDto>> {
  const parsed = placeNoteCreateSchema.parse(input);
  const normalized = { ...parsed, visibility: parsed.visibility ?? "private" };
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const place = await requireVisiblePlace(tx, slug, userId);
    const request = await reserveRequest(tx, userId, parsed.requestId, "place.note.create", {
      placeId: place.id,
      ...normalized,
    });
    if (request.resourceId) {
      const [row] = await tx
        .select()
        .from(placeNotes)
        .where(and(eq(placeNotes.id, request.resourceId), eq(placeNotes.userId, userId)));
      if (!row) deletedResource();
      return { data: serializePlaceNote(row), created: false };
    }
    const [row] = await tx
      .insert(placeNotes)
      .values({ ...normalized, placeId: place.id, userId })
      .returning();
    await syncNoteActivity(tx, userId, row.id);
    await completeRequest(tx, userId, parsed.requestId, row.id, `place-notes/${place.id}`);
    return { data: serializePlaceNote(row), created: true };
  });
}

export async function patchPlaceNote(
  userId: string,
  slug: string,
  id: string,
  input: PlaceNotePatch,
): Promise<PlaceNoteDto> {
  const parsed = placeNotePatchSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const place = await requireVisiblePlace(tx, slug, userId);
    const predicate = and(
      eq(placeNotes.id, id),
      eq(placeNotes.placeId, place.id),
      eq(placeNotes.userId, userId),
    );
    const [existing] = await tx.select().from(placeNotes).where(predicate);
    if (!existing) notFound("This note is unavailable.");
    if (
      existing.legacyTip &&
      ((parsed.visibility && parsed.visibility !== "private") ||
        (parsed.kind && parsed.kind !== "tip"))
    ) {
      invalidRequest("Legacy tips remain private. Write a separate note to share.");
    }
    const [row] = await tx
      .update(placeNotes)
      .set({ ...parsed, updatedAt: new Date() })
      .where(predicate)
      .returning();
    await syncNoteActivity(tx, userId, row.id);
    return serializePlaceNote(row);
  });
}

export async function deletePlaceNote(
  userId: string,
  slug: string,
  id: string,
): Promise<{ deleted: true }> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const place = await requireVisiblePlace(tx, slug, userId);
    const [row] = await tx
      .delete(placeNotes)
      .where(
        and(eq(placeNotes.id, id), eq(placeNotes.placeId, place.id), eq(placeNotes.userId, userId)),
      )
      .returning();
    if (!row) {
      const [request] = await tx
        .select()
        .from(apiRequests)
        .where(
          and(
            eq(apiRequests.userId, userId),
            eq(apiRequests.operation, "place.note.create"),
            eq(apiRequests.resourceId, id),
            eq(apiRequests.resourcePath, `place-notes/${place.id}`),
          ),
        );
      if (!request) notFound("This note is unavailable.");
    }
    return { deleted: true };
  });
}

export async function getPlaceTags(
  userId: string,
  slug: string,
  database: Database = db,
): Promise<PlaceTagsDto> {
  const place = await requireVisiblePlace(database, slug, userId);
  const [visible, mine] = await Promise.all([
    database
      .selectDistinct({ tag: placeTags.tag })
      .from(placeTags)
      .where(
        and(
          eq(placeTags.placeId, place.id),
          visibleTo(placeTags.visibility, placeTags.userId, userId),
        ),
      )
      .orderBy(asc(placeTags.tag))
      .limit(100),
    database
      .select({ tag: placeTags.tag })
      .from(placeTags)
      .where(and(eq(placeTags.placeId, place.id), eq(placeTags.userId, userId)))
      .orderBy(asc(placeTags.tag)),
  ]);
  return { tags: visible.map(({ tag }) => tag), myTags: mine.map(({ tag }) => tag) };
}

export async function putPlaceTags(
  userId: string,
  slug: string,
  input: PlaceTagPut,
): Promise<PlaceTagsDto> {
  const parsed = placeTagPutSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const place = await requireVisiblePlace(tx, slug, userId);
    await tx
      .delete(placeTags)
      .where(and(eq(placeTags.placeId, place.id), eq(placeTags.userId, userId)));
    if (parsed.tags.length)
      await tx.insert(placeTags).values(
        parsed.tags.map((tag) => ({
          placeId: place.id,
          userId,
          tag,
          visibility: parsed.visibility ?? "private",
        })),
      );
    return getPlaceTags(userId, slug, tx);
  });
}

export async function createPlaceSuggestion(
  userId: string,
  slug: string,
  input: PlaceSuggestionCreate,
): Promise<Created<PlaceSuggestionDto>> {
  const parsed = placeSuggestionSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const place = await requireVisiblePlace(tx, slug, userId);
    const request = await reserveRequest(tx, userId, parsed.requestId, "place.suggestion.create", {
      placeId: place.id,
      ...parsed,
    });
    const [row] = request.resourceId
      ? await tx
          .select()
          .from(placeSuggestions)
          .where(
            and(eq(placeSuggestions.id, request.resourceId), eq(placeSuggestions.userId, userId)),
          )
      : await tx
          .insert(placeSuggestions)
          .values({ ...parsed, placeId: place.id, userId })
          .returning();
    if (!row) deletedResource();
    if (!request.resourceId) await completeRequest(tx, userId, parsed.requestId, row.id);
    return {
      data: {
        id: row.id,
        placeId: row.placeId,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      },
      created: !request.resourceId,
    };
  });
}
