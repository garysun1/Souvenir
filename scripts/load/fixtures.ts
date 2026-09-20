import { createHash } from "node:crypto";
import type { Category } from "../../shared/api-contract";

export const cities = [
  {
    city: "Los Angeles",
    country: "US",
    timezone: "America/Los_Angeles",
    lat: 34.0522,
    lng: -118.2437,
  },
  { city: "New York", country: "US", timezone: "America/New_York", lat: 40.7128, lng: -74.006 },
  {
    city: "Mexico City",
    country: "MX",
    timezone: "America/Mexico_City",
    lat: 19.4326,
    lng: -99.1332,
  },
  { city: "Lisbon", country: "PT", timezone: "Europe/Lisbon", lat: 38.7223, lng: -9.1393 },
  { city: "Paris", country: "FR", timezone: "Europe/Paris", lat: 48.8566, lng: 2.3522 },
  { city: "Cairo", country: "EG", timezone: "Africa/Cairo", lat: 30.0444, lng: 31.2357 },
  { city: "Tokyo", country: "JP", timezone: "Asia/Tokyo", lat: 35.6762, lng: 139.6503 },
  { city: "Sydney", country: "AU", timezone: "Australia/Sydney", lat: -33.8688, lng: 151.2093 },
] as const;
const categories: Category[] = ["nature", "culture", "food", "landmark", "hidden_gem"];
export const fixtures = cities.flatMap((city, c) =>
  Array.from({ length: 20 }, (_, p) => ({
    ...city,
    key: `${c}-${p}`,
    name: `Synthetic load fixture ${city.city} ${p + 1}`,
    category: categories[p % categories.length],
    lat: city.lat + (p % 5) * 0.002,
    lng: city.lng + Math.floor(p / 5) * 0.002,
    description:
      "Synthetic test location. Not a destination recommendation. No documented hours, prices or destination photo.",
  })),
);
export const fixtureHash = createHash("sha256").update(JSON.stringify(fixtures)).digest("hex");

export function stableId(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function rng(seed: string) {
  let state = createHash("sha256").update(seed).digest().readUInt32LE();
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function persona(seed: string, index: number, editions: number | null) {
  const random = rng(`${seed}:persona:${index}`);
  const type = index % 10;
  const count = editions ?? (type < 4 ? 15 : type < 8 ? 40 : 65);
  return {
    type: type < 4 ? "casual" : type < 8 ? "regular" : "explorer",
    home: cities[index % cities.length],
    visits: Array.from({ length: count }, (_, i) => ({
      place: Math.floor(random() * fixtures.length),
      daysAgo: i === 0 ? 0 : Math.floor(random() * 120),
      visibility: (i % 3 === 0 ? "private" : i % 3 === 1 ? "friends" : "public") as
        | "private"
        | "friends"
        | "public",
      sentiment: (i % 5 < 3 ? "recommend" : i % 5 === 3 ? "depends" : "skip") as
        | "recommend"
        | "depends"
        | "skip",
    })),
  };
}

export function avatar(seed: string) {
  const random = rng(seed);
  const cells: string[] = [];
  const color = `hsl(${Math.floor(random() * 360)} 45% 40%)`;
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      if (random() > 0.5) {
        cells.push(`<rect x="${x * 20}" y="${y * 20}" width="20" height="20"/>`);
        if (x !== 2) cells.push(`<rect x="${(4 - x) * 20}" y="${y * 20}" width="20" height="20"/>`);
      }
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#eee"/><g fill="${color}">${cells.join("")}</g></svg>`;
}
