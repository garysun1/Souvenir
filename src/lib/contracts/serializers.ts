import type {
  PlaceImageDto,
  PlaceSourceDto,
  SocialEditionDto,
  SocialProfileDto,
} from "../../../shared/api-contract";
import type { editions, placeImages, placeSources, users } from "@/lib/db/schema";

export function serializePlaceSourceDto(row: typeof placeSources.$inferSelect): PlaceSourceDto {
  return {
    id: row.id,
    provider: row.provider,
    providerId: row.providerId,
    sourceUrl: row.sourceUrl,
    fetchedAt: row.fetchedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    status: row.status,
    license: row.license,
    licenseUrl: row.licenseUrl,
    attribution: row.attribution,
  };
}
export function serializePlaceImageDto(row: typeof placeImages.$inferSelect): PlaceImageDto {
  return {
    id: row.id,
    placeId: row.placeId,
    url: row.url,
    width: row.width,
    height: row.height,
    provider: row.provider,
    license: row.license,
    licenseUrl: row.licenseUrl,
    attribution: row.attribution,
    sourcePageUrl: row.sourcePageUrl,
    isHero: row.isHero,
    fetchedAt: row.fetchedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}
export function serializeSocialProfileDto(row: typeof users.$inferSelect): SocialProfileDto {
  return { id: row.id, handle: row.handle, displayName: row.displayName, avatarUrl: row.avatarUrl };
}
export function serializeSocialEditionDto(row: typeof editions.$inferSelect): SocialEditionDto {
  return {
    id: row.id,
    userId: row.userId,
    placeId: row.placeId,
    capturedAt: row.capturedAt.toISOString(),
    variant: row.variant,
  };
}
