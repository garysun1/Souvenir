import { z } from "zod";
import { categorySchema } from "@/lib/schemas";
import type { BoundingBox, NearbyQuery } from "../../../shared/api-contract";

export const coordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});
export const safeUrlSchema = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  });
export const providerPlaceSchema = coordinatesSchema.extend({
  provider: z.enum(["osm", "wikidata", "curated"]),
  providerId: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  category: categorySchema,
  city: z.string().trim().min(1).max(160).nullable().default(null),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .default(null),
  region: z.string().max(160).nullable().default(null),
  timezone: z
    .string()
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    })
    .nullable()
    .default(null),
  website: safeUrlSchema.nullable().default(null),
  description: z.string().max(2000).nullable().default(null),
  openingHours: z.string().max(1000).nullable().default(null),
  wikidataId: z
    .string()
    .regex(/^Q[1-9]\d*$/)
    .nullable()
    .default(null),
  imageRefs: z.array(z.string().min(1).max(240)).max(5).default([]),
  fetchedAt: z.string().datetime(),
  evidence: z.enum(["provider", "synthetic-fixture"]),
});
export type ProviderPlace = z.output<typeof providerPlaceSchema>;
export interface PlacesProvider {
  readonly name: "osm" | "curated";
  nearby(query: NearbyQuery): Promise<ProviderPlace[]>;
  bbox(box: BoundingBox, limit: number): Promise<ProviderPlace[]>;
}
export class ProviderError extends Error {
  constructor(
    public readonly code:
      | "unavailable"
      | "invalid_response"
      | "rate_limited"
      | "too_large"
      | "not_configured",
    public readonly retryAfterMs = 0,
  ) {
    super(`Destination provider ${code.replaceAll("_", " ")}.`);
  }
}
