import type { PlaceCreate, PlaceDto, PlaceMetricsDto } from "../../../shared/api-contract";

export interface CustomPlaceFields {
  name: string;
  category: PlaceCreate["category"];
  lat: string;
  lng: string;
  city: string;
  country: string;
}

export function privatePlaceCreate(fields: CustomPlaceFields, requestId: string): PlaceCreate {
  if (!fields.name.trim() || !fields.lat.trim() || !fields.lng.trim())
    throw new Error("Enter a name and explicit coordinates.");
  const lat = Number(fields.lat);
  const lng = Number(fields.lng);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180)
    throw new Error("Enter latitude from −90 to 90 and longitude from −180 to 180.");
  const country = fields.country.trim().toUpperCase() || null;
  if (country && !/^[A-Z]{2}$/.test(country))
    throw new Error("Use a two-letter country code, or leave it unknown.");
  return {
    requestId,
    name: fields.name.trim(),
    category: fields.category,
    lat,
    lng,
    city: fields.city.trim() || null,
    country,
    visibility: "private",
  };
}

export function placeLocation(place: Pick<PlaceDto, "city" | "country" | "region">) {
  return [place.city, place.region, place.country].filter(Boolean).join(", ") || "Locality unknown";
}

export function placePath(slug: string) {
  return `/places/${encodeURIComponent(slug)}`;
}

export function canonicalPlaceId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function cityOptions(places: PlaceDto[]) {
  const cities = new Map<string, { city: string; country: string }>();
  for (const place of places) {
    if (place.city && place.country) {
      cities.set(JSON.stringify([place.city, place.country]), {
        city: place.city,
        country: place.country,
      });
    }
  }
  return [...cities.entries()].sort(([, a], [, b]) =>
    `${a.city}, ${a.country}`.localeCompare(`${b.city}, ${b.country}`),
  );
}

export function frequencyText(metrics: PlaceMetricsDto | null | undefined) {
  if (!metrics || !metrics.frequency.city || !metrics.frequency.country)
    return "Unknown — no documented city cohort.";
  const { frequency } = metrics;
  if (frequency.status === "stale") return "Stale — refresh to see current discovery frequency.";
  if (frequency.status === "unavailable") return "Unknown — discovery frequency is unavailable.";
  if (frequency.status !== "ready" || metrics.discoveryFreq === null)
    return `Unknown — ${frequency.cityVisitors90d} collectors in the 90-day cohort; at least ${frequency.minimumCohort} are needed.`;
  return `Collected by ${new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(metrics.discoveryFreq)} of collectors in ${frequency.city}, ${frequency.country} over 90 days (${frequency.visitors90d} of ${frequency.cityVisitors90d}).`;
}

export function atlasPoints(places: PlaceDto[]) {
  return places
    .filter(
      (place) =>
        Number.isFinite(place.lat) &&
        Math.abs(place.lat) <= 90 &&
        Number.isFinite(place.lng) &&
        Math.abs(place.lng) <= 180,
    )
    .map((place) => ({
      place,
      x: ((place.lng + 180) / 360) * 960,
      y: ((90 - place.lat) / 180) * 480,
    }));
}

export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
