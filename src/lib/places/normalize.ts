import { createHash } from "node:crypto";
import type { places, placeSources } from "@/lib/db/schema";
import { geohash } from "./geo";
import { providerPlaceSchema, type ProviderPlace } from "./types";
import { POLICY_CHECKED_AT, providerSourceUrl, sourcePolicies } from "./policies";

export function normalizedName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function normalizePlace(input: ProviderPlace): typeof places.$inferInsert {
  const place = providerPlaceSchema.parse(input);
  if ((place.provider === "curated") !== (place.evidence === "synthetic-fixture")) {
    throw new Error("Fixture records must use their own curated namespace.");
  }
  if (place.provider === "osm" && !/^(node|way|relation)\/[1-9]\d*$/.test(place.providerId))
    throw new Error("Invalid OSM identity.");
  if (place.provider === "wikidata" && !/^Q[1-9]\d*$/.test(place.providerId))
    throw new Error("Invalid Wikidata identity.");
  const hash = createHash("sha256")
    .update(`${place.provider}:${place.providerId}`)
    .digest("hex")
    .slice(0, 16);
  const stem =
    normalizedName(place.name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 170) || "place";
  const wikidataId = place.provider === "wikidata" ? place.providerId : place.wikidataId;
  return {
    slug: `${stem}-${hash}`,
    name: place.name,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
    city: place.city,
    country: place.country,
    region: place.region,
    timezone: place.timezone,
    website: place.website,
    wikidataId,
    source: place.provider,
    sourceUpdatedAt: new Date(place.fetchedAt),
    fetchedAt: new Date(place.fetchedAt),
    geohash: geohash(place.lat, place.lng),
    description: place.description ?? "",
    visibility: "public",
    heroImageUrl: null,
    rarityTier: "common",
    rarityAppeal: 0,
    rarityDiscoveryFreq: 0,
    rarityAvailability: 0,
    externalIds: {
      ...(wikidataId ? { wikidata: wikidataId } : {}),
      [place.provider]: place.providerId,
    },
    stats: {
      provenance:
        place.evidence === "synthetic-fixture" ? "synthetic-fixture" : `${place.provider}-catalog`,
      verified: false,
      rarityStatus: "unavailable",
      evidence: place.evidence,
    },
  };
}
export function normalizeSource(
  record: ProviderPlace,
  placeId: string,
): typeof placeSources.$inferInsert {
  const payload = {
    openingHours: record.openingHours,
    timezone: record.timezone,
    evidence: record.evidence,
  };
  return {
    placeId,
    provider: record.provider,
    providerId: record.providerId,
    payload,
    fetchedAt: new Date(record.fetchedAt),
    expiresAt: null,
    retentionPolicy: "licensed",
    retainedFields: Object.keys(payload),
    ...sourcePolicies[record.provider],
    policyCheckedAt: POLICY_CHECKED_AT,
    sourceUrl: providerSourceUrl(record),
    status: record.evidence === "provider" ? "ready" : "unavailable",
  };
}
