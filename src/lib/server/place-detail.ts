import { and, asc, countDistinct, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { editions, placeSources, wishlistSaves } from "@/lib/db/schema";
import { serializePlaceSourceDto } from "@/lib/contracts/serializers";
import type {
  DocumentedAvailabilityDto,
  PlaceDetailDto,
  PlaceMetricsDto,
  PlaceSourceDto,
} from "../../../shared/api-contract";
import { serializeCatalogPlace } from "./catalog";
import { getPlaceImages } from "./place-images";
import { getPlaceNotes, getPlaceTags } from "./place-metadata";
import { acceptedFriendOf, requireVisiblePlace, visibleTo } from "./place-visibility";

export interface PlaceDetailReaders {
  metrics?: (placeId: string) => Promise<PlaceMetricsDto | null>;
  availability?: (placeId: string) => Promise<DocumentedAvailabilityDto>;
}

export async function getPlaceSources(userId: string, slug: string): Promise<PlaceSourceDto[]> {
  const place = await requireVisiblePlace(db, slug, userId);
  const rows = await db
    .select()
    .from(placeSources)
    .where(eq(placeSources.placeId, place.id))
    .orderBy(asc(placeSources.id))
    .limit(50);
  return rows.map((row) => ({
    ...serializePlaceSourceDto(row),
    status: row.expiresAt && row.expiresAt <= new Date() ? "stale" : row.status,
  }));
}

export async function getPlaceDetail(
  userId: string,
  slug: string,
  readers: PlaceDetailReaders = {},
): Promise<PlaceDetailDto> {
  const place = await requireVisiblePlace(db, slug, userId);
  const [notes, myNotes, tags, images, sources, been, saved, metrics, availability] =
    await Promise.all([
      getPlaceNotes(userId, slug),
      getPlaceNotes(userId, slug, db, true),
      getPlaceTags(userId, slug),
      getPlaceImages(userId, slug),
      getPlaceSources(userId, slug),
      db
        .select({ count: countDistinct(editions.userId) })
        .from(editions)
        .where(
          and(
            eq(editions.placeId, place.id),
            acceptedFriendOf(editions.userId, userId),
            visibleTo(editions.visibility, editions.userId, userId),
          ),
        ),
      db
        .select({ count: countDistinct(wishlistSaves.userId) })
        .from(wishlistSaves)
        .where(
          and(
            eq(wishlistSaves.placeId, place.id),
            acceptedFriendOf(wishlistSaves.userId, userId),
            visibleTo(wishlistSaves.visibility, wishlistSaves.userId, userId),
          ),
        ),
      readers.metrics?.(place.id) ?? Promise.resolve(null),
      readers.availability?.(place.id) ??
        Promise.resolve<DocumentedAvailabilityDto>({
          status: "unknown",
          openingHours: null,
          timezone: place.timezone,
          sourceId: null,
          fetchedAt: null,
        }),
    ]);
  return {
    ...serializeCatalogPlace(place),
    ...tags,
    notes,
    myNotes,
    images,
    sources,
    metrics,
    availability,
    heroImageUrl: images.find((image) => image.isHero)?.url ?? null,
    social: { friendsBeen: been[0].count, friendsSaved: saved[0].count },
  };
}
