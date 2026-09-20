import type { Place } from "@/lib/schemas";
import type { editions, places, users } from "@/lib/db/schema";
import type {
  AuthContext,
  CollectionEntryDto,
  EditionDto,
  PlaceDto,
  ProfileDto,
} from "../../shared/api-contract";
import { signCapturePhoto } from "@/lib/auth/storage";
import { ApiError } from "@/lib/server/errors";

export function serializePlace(row: typeof places.$inferSelect): Place {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    city: row.city,
    country: row.country,
    region: row.region,
    timezone: row.timezone,
    website: row.website,
    wikidataId: row.wikidataId,
    source: row.source,
    sourceUpdatedAt: row.sourceUpdatedAt,
    fetchedAt: row.fetchedAt,
    visibility: row.visibility,
    description: row.description,
    heroImageUrl: row.heroImageUrl,
    rarityTier: row.rarityTier,
    rarityAppeal: row.rarityAppeal,
    rarityDiscoveryFreq: row.rarityDiscoveryFreq,
    rarityAvailability: row.rarityAvailability,
    externalIds: row.externalIds ?? null,
    stats: row.stats ?? null,
    createdAt: row.createdAt,
  };
}

export function serializePlaceDto(row: typeof places.$inferSelect): PlaceDto {
  return {
    ...serializePlace(row),
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
    fetchedAt: row.fetchedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeProfileDto(row: typeof users.$inferSelect): ProfileDto {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function serializeEditionDto(
  auth: AuthContext,
  row: typeof editions.$inferSelect,
): Promise<EditionDto> {
  if (row.userId !== auth.userId) {
    throw new ApiError(404, "not_found", "This edition is unavailable.");
  }
  const origin = row.origin;
  if (origin !== "capture" && origin !== "import" && origin !== "legacy") {
    throw new ApiError(500, "internal_error", "This edition needs repair.");
  }
  return {
    id: row.id,
    userId: row.userId,
    placeId: row.placeId,
    requestId: row.requestId,
    capturedAt: row.capturedAt.toISOString(),
    timezone: row.timezone,
    note: row.note,
    companions: row.companions,
    variant: row.variant,
    visitSequence: row.visitSequence,
    origin,
    importSourceId: row.importSourceId,
    outingId: row.outingId,
    photo: row.photoPath ? await signCapturePhoto(auth, row.photoPath) : null,
    createdAt: row.createdAt.toISOString(),
    visibility: row.visibility,
  };
}

export async function serializeCollectionEntryDto(
  auth: AuthContext,
  row: { edition: typeof editions.$inferSelect; place: typeof places.$inferSelect },
): Promise<CollectionEntryDto> {
  return { ...(await serializeEditionDto(auth, row.edition)), place: serializePlaceDto(row.place) };
}
