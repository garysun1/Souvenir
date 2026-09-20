import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  editions,
  importItems,
  memoryMoments,
  placePreferences,
  places,
  rankings,
  wishlistSaves,
} from "@/lib/db/schema";
import type { TasteSourceRef } from "../../../shared/memories-contract";
import { memoryGroupKey, type TasteSignal } from "../../../shared/taste";
import type { TasteSourceContent } from "@/lib/ai/taste";
import { placeVisibleTo } from "./place-visibility";
import { notFound } from "./errors";
import type { Database } from "./transactions";

export interface AuthorizedTasteSource extends TasteSignal {
  facts: string;
  intent: TasteSourceContent["intent"];
  photoPath: string | null;
}

export async function resolveTasteSource(
  database: Database,
  userId: string,
  source: TasteSourceRef,
): Promise<AuthorizedTasteSource | null> {
  if (source.kind === "import_item") {
    const [item] = await database
      .select()
      .from(importItems)
      .where(
        and(
          eq(importItems.ownerId, userId),
          eq(importItems.id, source.id),
          inArray(importItems.state, ["uploaded", "processing", "failed", "ready", "committed"]),
        ),
      );
    if (!item?.photoPath) return null;
    return {
      source,
      facts: "A selected photo. Presence is weak evidence of interest.",
      intent: "enjoyed",
      photoPath: item.photoPath,
      hash: item.sha256,
      weight: 0.25,
      visitKey: item.confirmedStop
        ? memoryGroupKey({ ...item, groupKey: null })
        : `batch:${item.batchId}`,
    };
  }
  if (source.kind === "edition") {
    const [row] = await database
      .select({ edition: editions, place: places })
      .from(editions)
      .innerJoin(places, eq(editions.placeId, places.id))
      .where(and(eq(editions.userId, userId), eq(editions.id, source.id), placeVisibleTo(userId)));
    if (!row) return null;
    const [imported] = row.edition.photoPath
      ? await database
          .select({ sha256: importItems.sha256 })
          .from(importItems)
          .where(
            and(eq(importItems.ownerId, userId), eq(importItems.photoPath, row.edition.photoPath)),
          )
      : [];
    return {
      source,
      facts: placeFacts(row.place),
      intent: "enjoyed",
      photoPath: row.edition.photoPath,
      hash: imported?.sha256 ?? row.edition.photoPath,
      weight: 0.25,
      visitKey: memoryGroupKey({
        id: row.edition.id,
        groupKey: null,
        confirmedStop: {
          placeId: row.place.id,
          capturedAt: row.edition.capturedAt.toISOString(),
          timezone: row.edition.timezone,
        },
      }),
    };
  }
  const proof =
    source.kind === "saved_place"
      ? sql`exists (select 1 from ${wishlistSaves} where ${wishlistSaves.userId} = ${userId} and ${wishlistSaves.placeId} = ${places.id})`
      : source.kind === "favorite"
        ? sql`exists (select 1 from ${placePreferences} where ${placePreferences.userId} = ${userId} and ${placePreferences.placeId} = ${places.id} and ${placePreferences.favorite})`
        : sql`exists (select 1 from ${rankings} where ${rankings.userId} = ${userId} and ${rankings.placeId} = ${places.id} and ${rankings.wouldRecommend})`;
  const [place] = await database
    .select()
    .from(places)
    .where(and(eq(places.id, source.id), placeVisibleTo(userId), proof));
  if (!place) return null;
  return {
    source,
    facts: placeFacts(place),
    photoPath: null,
    hash: null,
    intent: source.kind === "saved_place" ? "want_to_try" : "enjoyed",
    weight: 1,
    visitKey: `place:${place.id}`,
  };
}

function placeFacts(place: typeof places.$inferSelect) {
  return JSON.stringify({
    name: place.name.slice(0, 160),
    category: place.category,
    description: place.description.slice(0, 400),
  });
}

export async function resolveTasteSources(
  database: Database,
  userId: string,
  sources: TasteSourceRef[],
  strict = true,
) {
  const resolved: AuthorizedTasteSource[] = [];
  for (const source of sources) {
    const item = await resolveTasteSource(database, userId, source);
    if (!item) {
      if (strict) notFound("A selected source is unavailable.");
    } else resolved.push(item);
  }
  return resolved;
}

export async function ownedCollageIds(
  database: Database,
  userId: string,
  ids: string[],
  strict = true,
) {
  if (!ids.length) return [];
  const rows = await database
    .select()
    .from(memoryMoments)
    .where(
      and(
        inArray(memoryMoments.id, ids),
        eq(memoryMoments.authorId, userId),
        isNull(memoryMoments.withdrawnAt),
      ),
    );
  const allowed: string[] = [];
  for (const row of rows) {
    const source: TasteSourceRef = row.sourceImportItemId
      ? { kind: "import_item", id: row.sourceImportItemId }
      : { kind: "edition", id: row.sourceEditionId! };
    if ((await resolveTasteSource(database, userId, source))?.photoPath) allowed.push(row.id);
  }
  if (strict && allowed.length !== ids.length) notFound("A selected collage photo is unavailable.");
  return ids.filter((id) => allowed.includes(id));
}
