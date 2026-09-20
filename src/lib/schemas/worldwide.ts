import { z } from "zod";

export const visibilitySchema = z.enum(["private", "friends", "public"]);
export const placeSourceSchema = z.enum([
  "curated",
  "osm",
  "wikidata",
  "wikimedia",
  "google",
  "opentripmap",
  "user",
  "placeholder",
]);
export const sampleStatusSchema = z.enum(["unavailable", "insufficient", "ready", "stale"]);
export const countrySchema = z.string().regex(/^[A-Z]{2}$/, "Use an ISO alpha-2 country code");
export const latitudeSchema = z.number().finite().min(-90).max(90);
export const longitudeSchema = z.number().finite().min(-180).max(180);
export const httpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an HTTP(S) URL without credentials");
