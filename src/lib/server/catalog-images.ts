import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { placeImages, places, placeSources } from "@/lib/db/schema";
import { serializePlaceImageDto } from "@/lib/contracts/serializers";
import { mergePlaceImages, type CatalogImagePlace } from "@/lib/places/catalog-images";
import type { Database } from "./transactions";

export function approvedImageConditions(now = new Date()) {
  return and(
    sql`btrim(${placeImages.license}) <> ''`,
    sql`btrim(${placeImages.attribution}) <> ''`,
    sql`${placeImages.url} ~ '^https://[^/@[:space:]]+(/|$)'`,
    sql`${placeImages.sourcePageUrl} ~ '^https://[^/@[:space:]]+(/|$)'`,
    or(isNull(placeImages.expiresAt), gt(placeImages.expiresAt, now)),
    or(
      isNull(placeImages.sourceId),
      and(
        eq(placeSources.status, "ready"),
        or(isNull(placeSources.expiresAt), gt(placeSources.expiresAt, now)),
      ),
    ),
  );
}

export async function withCatalogImages(
  rows: (typeof places.$inferSelect)[],
  database: Database = db,
): Promise<CatalogImagePlace[]> {
  if (!rows.length) return [];
  const heroes = await database
    .selectDistinctOn([placeImages.placeId], { image: placeImages })
    .from(placeImages)
    .leftJoin(placeSources, eq(placeImages.sourceId, placeSources.id))
    .where(
      and(
        inArray(placeImages.placeId, [...new Set(rows.map((row) => row.id))]),
        eq(placeImages.isHero, true),
        approvedImageConditions(),
      ),
    )
    .orderBy(asc(placeImages.placeId), desc(placeImages.fetchedAt), asc(placeImages.id));
  const byPlace = new Map(
    heroes.map(({ image }) => [image.placeId, serializePlaceImageDto(image)]),
  );
  return rows.map((row) => {
    const hero = byPlace.get(row.id);
    return { ...row, images: mergePlaceImages(row, hero ? [hero] : []) };
  });
}
