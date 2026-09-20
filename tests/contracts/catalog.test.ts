import { describe, expect, it } from "vitest";
import baseline from "../../db/seed/la-places.json";
import extension from "../../db/seed/mobile-extension.json";
import { mobileFixtureToSlug } from "../../shared/catalog-map";

describe("canonical catalog mapping", () => {
  it("maps every prototype place to a unique existing or additive canonical slug", () => {
    const canonical = new Set([...baseline, ...extension].map((place) => place.slug));
    const mapped = Object.values(mobileFixtureToSlug);
    expect(mapped).toHaveLength(30);
    expect(new Set(mapped).size).toBe(30);
    expect(mapped.every((slug) => canonical.has(slug))).toBe(true);
    expect(extension).toHaveLength(22);
    expect(extension.every((place) => !baseline.some((old) => old.slug === place.slug))).toBe(true);
    expect(mobileFixtureToSlug["la-griffith-park"]).not.toBe("griffith-park-old-zoo");
  });
  it("does not promote prototype prices, hours or discovery counts", () => {
    for (const place of extension) {
      expect(Object.keys(place).sort()).toEqual([
        "category",
        "description",
        "lat",
        "lng",
        "name",
        "slug",
      ]);
    }
  });
});
