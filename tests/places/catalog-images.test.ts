import { describe, expect, it } from "vitest";
import { z } from "zod";
import { curatedPlaceImages, mergePlaceImages } from "@/lib/places/catalog-images";
import { serializePlaceDto } from "@/lib/serializers";
import type { places } from "@/lib/db/schema";
import manifest from "../../db/seed/catalog-images.json";

const selected = manifest.find((image) => image.slug === "griffith-observatory")!;
const place: typeof places.$inferSelect = {
  id: "fa801522-506e-4bb3-98ca-51cda516d0ee",
  slug: selected.slug,
  name: "Griffith Observatory",
  category: "landmark",
  lat: selected.lat,
  lng: selected.lng,
  city: "Los Angeles",
  country: "US",
  region: null,
  timezone: null,
  website: null,
  wikidataId: null,
  source: "curated",
  sourceUpdatedAt: null,
  fetchedAt: null,
  geohash: null,
  ownerId: null,
  visibility: "public",
  requestId: null,
  description: "",
  heroImageUrl: "https://unapproved.test/photo.jpg",
  rarityTier: "common",
  rarityAppeal: 0,
  rarityDiscoveryFreq: 0,
  rarityAvailability: 0,
  externalIds: null,
  stats: null,
  createdAt: new Date("2026-09-20T00:00:00Z"),
};

describe("reviewed catalog photography", () => {
  it("carries the same credited hero through web and mobile wire fields", () => {
    const result = serializePlaceDto(place);
    expect(result.heroImageUrl).toBe(selected.url);
    expect(result.images).toEqual(curatedPlaceImages(place));
    expect(result.images?.[0]).toMatchObject({
      placeId: place.id,
      isHero: true,
      attribution: selected.attribution,
      license: selected.license,
    });
  });

  it("does not map photographs by name alone or expose legacy URLs", () => {
    for (const override of [
      { slug: "another-place" },
      { source: "user" as const },
      { visibility: "private" as const },
      { lat: selected.lat + 1 },
      { lng: selected.lng + 1 },
      { stats: { evidence: "synthetic-fixture" } },
      { stats: { provenance: "synthetic-fixture" } },
    ]) {
      expect(serializePlaceDto({ ...place, ...override })).toMatchObject({
        heroImageUrl: null,
        images: [],
      });
    }
  });

  it("prefers an approved database hero and deduplicates the curated fallback", () => {
    const [curated] = curatedPlaceImages(place);
    const hero = { ...curated, id: "db-image", url: "https://approved.test/hero.jpg" };
    expect(mergePlaceImages(place, [hero])).toEqual([hero]);
    expect(serializePlaceDto({ ...place, images: [hero] }).heroImageUrl).toBe(hero.url);
    expect(mergePlaceImages(place, [{ ...curated, isHero: false }])).toEqual([curated]);
    expect(mergePlaceImages({ ...place, slug: "unknown" }, [])).toEqual([]);
  });

  it("ships unique, credited, location-specific HTTPS sources with image dimensions", () => {
    expect(new Set(manifest.map((image) => image.slug)).size).toBe(manifest.length);
    expect(new Set(manifest.map((image) => image.id)).size).toBe(manifest.length);
    for (const image of manifest) {
      expect(z.string().uuid().safeParse(image.id).success).toBe(true);
      expect(image.attribution.trim()).not.toBe("");
      expect(image.license.trim()).not.toBe("");
      expect(image.width).toBeGreaterThan(0);
      expect(image.height).toBeGreaterThan(0);
      expect(["https://thumb.wikimedia.org", "https://upload.wikimedia.org"]).toContain(
        new URL(image.url).origin,
      );
      expect(new URL(image.sourcePageUrl).origin).toBe("https://commons.wikimedia.org");
      expect(image.url).not.toContain("@");
      expect(Number.isFinite(Date.parse(image.fetchedAt))).toBe(true);
    }
  });
});
