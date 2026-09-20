import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { placeSources } from "@/lib/db/schema";
import { getDocumentedAvailability } from "@/lib/places/store";
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
import { requireVisiblePlace } from "./place-visibility";
import { getPlaceMetrics, getPlaceSocial } from "./stats";

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
  const [notes, myNotes, tags, images, sources, social, metrics, availability] = await Promise.all([
    getPlaceNotes(userId, slug),
    getPlaceNotes(userId, slug, db, true),
    getPlaceTags(userId, slug),
    getPlaceImages(userId, slug),
    getPlaceSources(userId, slug),
    getPlaceSocial(userId, place.id),
    readers.metrics?.(place.id) ?? getPlaceMetrics(userId, place.id),
    readers.availability?.(place.id) ?? getDocumentedAvailability(place.id),
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
    social,
  };
}
