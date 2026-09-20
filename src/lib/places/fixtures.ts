import { providerPlaceSchema, type ProviderPlace } from "./types";

export const fixtureCities = [
  {
    slug: "los-angeles",
    city: "Los Angeles",
    country: "US",
    lat: 34.05,
    lng: -118.25,
    timezone: "America/Los_Angeles",
  },
  {
    slug: "new-york",
    city: "New York City",
    country: "US",
    lat: 40.73,
    lng: -73.99,
    timezone: "America/New_York",
  },
  {
    slug: "mexico-city",
    city: "Mexico City",
    country: "MX",
    lat: 19.43,
    lng: -99.13,
    timezone: "America/Mexico_City",
  },
  {
    slug: "lisbon",
    city: "Lisbon",
    country: "PT",
    lat: 38.72,
    lng: -9.14,
    timezone: "Europe/Lisbon",
  },
  { slug: "paris", city: "Paris", country: "FR", lat: 48.85, lng: 2.35, timezone: "Europe/Paris" },
  { slug: "cairo", city: "Cairo", country: "EG", lat: 30.04, lng: 31.24, timezone: "Africa/Cairo" },
  { slug: "tokyo", city: "Tokyo", country: "JP", lat: 35.68, lng: 139.76, timezone: "Asia/Tokyo" },
  {
    slug: "sydney",
    city: "Sydney",
    country: "AU",
    lat: -33.87,
    lng: 151.21,
    timezone: "Australia/Sydney",
  },
] as const;
export type FixtureCity = (typeof fixtureCities)[number];
export function buildFixtureCity(city: FixtureCity): ProviderPlace[] {
  const categories = ["nature", "culture", "food", "landmark", "hidden_gem"] as const;
  return Array.from({ length: 250 }, (_, i) =>
    providerPlaceSchema.parse({
      provider: "curated",
      providerId: `synthetic-v1/${city.slug}/${String(i + 1).padStart(3, "0")}`,
      name: `[Fixture] ${city.city} ${categories[i % categories.length]} ${String(i + 1).padStart(3, "0")}`,
      category: categories[i % categories.length],
      city: city.city,
      country: city.country,
      lat: Number((city.lat + (Math.floor(i / 25) - 4.5) * 0.002).toFixed(6)),
      lng: Number((city.lng + ((i % 25) - 12) * 0.002).toFixed(6)),
      timezone: city.timezone,
      description:
        "Authored synthetic destination for disposable local validation. Not a real place or provider observation.",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      evidence: "synthetic-fixture",
    }),
  );
}
