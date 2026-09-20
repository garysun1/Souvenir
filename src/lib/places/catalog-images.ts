import manifest from "../../../db/seed/catalog-images.json";
import type { places } from "@/lib/db/schema";
import type { PlaceImageDto } from "../../../shared/api-contract";

export type CatalogImagePlace = typeof places.$inferSelect & { images?: PlaceImageDto[] };

const imagesBySlug = new Map(manifest.map((image) => [image.slug, image]));

export function curatedPlaceImages(place: typeof places.$inferSelect): PlaceImageDto[] {
  const image = imagesBySlug.get(place.slug);
  if (
    !image ||
    place.source === "user" ||
    place.visibility !== "public" ||
    place.stats?.evidence === "synthetic-fixture" ||
    place.stats?.provenance === "synthetic-fixture" ||
    Math.abs(place.lat - image.lat) > 0.001 ||
    Math.abs(place.lng - image.lng) > 0.001
  )
    return [];
  return [
    {
      id: image.id,
      placeId: place.id,
      url: image.url,
      width: image.width,
      height: image.height,
      provider: "wikimedia",
      license: image.license,
      licenseUrl: image.licenseUrl,
      attribution: image.attribution,
      sourcePageUrl: image.sourcePageUrl,
      isHero: true,
      fetchedAt: image.fetchedAt,
      expiresAt: null,
    },
  ];
}

export function mergePlaceImages(
  place: typeof places.$inferSelect,
  approved: PlaceImageDto[],
): PlaceImageDto[] {
  if (approved.some((image) => image.isHero)) return approved;
  const curated = curatedPlaceImages(place);
  return [
    ...curated,
    ...approved.filter((image) => !curated.some((item) => item.url === image.url)),
  ];
}
