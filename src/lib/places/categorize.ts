import type { ProviderPlace } from "./types";

export function categorize(tags: Record<string, string>): ProviderPlace["category"] | null {
  if (
    ["museum", "gallery", "artwork"].includes(tags.tourism) ||
    ["theatre", "arts_centre", "library"].includes(tags.amenity)
  )
    return "culture";
  if (
    ["park", "garden", "nature_reserve"].includes(tags.leisure) ||
    ["beach", "peak", "waterfall"].includes(tags.natural)
  )
    return "nature";
  if (["restaurant", "cafe", "food_court", "marketplace"].includes(tags.amenity)) return "food";
  if (
    tags.historic ||
    ["attraction", "viewpoint"].includes(tags.tourism) ||
    tags.amenity === "place_of_worship"
  )
    return "landmark";
  return null;
}
