import { z } from "zod";
import type {
  FeedQuery,
  LeaderboardQuery,
  NearbyQuery,
  PlaceCreate,
  PlaceImagePromote,
  PlaceNoteCreate,
  PlaceNotePatch,
  PlaceSuggestionCreate,
  PlaceTagPut,
  TrendingQuery,
} from "../../../shared/worldwide-contract";
import { categorySchema } from "@/lib/schemas/domain";
import {
  countrySchema,
  httpUrlSchema,
  latitudeSchema,
  longitudeSchema,
  visibilitySchema,
} from "@/lib/schemas/worldwide";
import { instantSchema, timezoneSchema, uuidSchema } from "./primitives";

const locality = z.string().trim().min(1).max(200);
const queryNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
    schema,
  );
const queryLimit = queryNumber(z.number().int().min(1).max(50)).default(25);

export const placeCreateSchema = z
  .object({
    requestId: uuidSchema,
    name: z.string().trim().min(1).max(200),
    category: categorySchema,
    lat: latitudeSchema,
    lng: longitudeSchema,
    city: locality.nullable().optional(),
    country: countrySchema.nullable().optional(),
    region: locality.nullable().optional(),
    timezone: timezoneSchema.nullable().optional(),
    website: httpUrlSchema.nullable().optional(),
    description: z.string().max(2000).optional(),
    visibility: visibilitySchema.optional(),
  })
  .strict() satisfies z.ZodType<PlaceCreate>;
export const placeNoteCreateSchema = z
  .object({
    requestId: uuidSchema,
    kind: z.enum(["tip", "warning", "hours", "access", "story"]),
    body: z.string().trim().min(1).max(600),
    visibility: visibilitySchema.optional(),
  })
  .strict() satisfies z.ZodType<PlaceNoteCreate>;
export const placeNotePatchSchema = placeNoteCreateSchema
  .omit({ requestId: true })
  .partial()
  .refine(
    (input) => Object.keys(input).length > 0,
    "Supply an edit",
  ) satisfies z.ZodType<PlaceNotePatch>;
export const placeTagPutSchema = z
  .object({
    tags: z
      .array(
        z
          .string()
          .max(32)
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      )
      .max(10)
      .refine((tags) => new Set(tags).size === tags.length, "Duplicate tags"),
    visibility: visibilitySchema.optional(),
  })
  .strict() satisfies z.ZodType<PlaceTagPut>;
export const placeSuggestionSchema = z.discriminatedUnion("field", [
  z
    .object({
      requestId: uuidSchema,
      field: z.literal("name"),
      value: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      requestId: uuidSchema,
      field: z.literal("hours"),
      value: z
        .object({
          text: z.string().trim().min(1).max(1000),
          timezone: timezoneSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({ requestId: uuidSchema, field: z.literal("website"), value: httpUrlSchema.nullable() })
    .strict(),
  z
    .object({
      requestId: uuidSchema,
      field: z.literal("coords"),
      value: z.object({ lat: latitudeSchema, lng: longitudeSchema }).strict(),
    })
    .strict(),
  z.object({ requestId: uuidSchema, field: z.literal("closed"), value: z.boolean() }).strict(),
]) satisfies z.ZodType<PlaceSuggestionCreate>;
export const placeImagePromoteSchema = z
  .object({
    requestId: uuidSchema,
    editionId: uuidSchema,
    confirmPublic: z.literal(true),
    rightsConfirmed: z.literal(true),
    license: z.enum(["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0"]),
    attribution: z.string().trim().min(1).max(1000),
  })
  .strict() satisfies z.ZodType<PlaceImagePromote>;
export const nearbyQuerySchema = z
  .object({
    lat: queryNumber(latitudeSchema),
    lng: queryNumber(longitudeSchema),
    radiusM: queryNumber(z.number().int().min(50).max(50_000)).default(1500),
    category: categorySchema.optional(),
    country: countrySchema.optional(),
    limit: queryLimit,
  })
  .strict() satisfies z.ZodType<NearbyQuery, z.ZodTypeDef, unknown>;
export const boundingBoxSchema = z
  .object({
    south: queryNumber(latitudeSchema),
    west: queryNumber(longitudeSchema),
    north: queryNumber(latitudeSchema),
    east: queryNumber(longitudeSchema),
  })
  .strict()
  .refine((box) => box.south <= box.north, "South must not exceed north");
export const placeListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    city: locality.optional(),
    country: countrySchema.optional(),
    category: categorySchema.optional(),
    south: queryNumber(latitudeSchema).optional(),
    west: queryNumber(longitudeSchema).optional(),
    north: queryNumber(latitudeSchema).optional(),
    east: queryNumber(longitudeSchema).optional(),
    limit: queryNumber(z.number().int().min(1).max(100)).optional(),
  })
  .strict()
  .refine((q) => !q.city || q.country, "City filters require a country")
  .refine((q) => {
    const values = [q.south, q.west, q.north, q.east];
    return (
      values.every((v) => v === undefined) ||
      (values.every((v) => v !== undefined) && q.south! <= q.north!)
    );
  }, "Supply a complete valid bounding box");
export const userIdParamsSchema = z.object({ userId: uuidSchema }).strict();
export const placeSlugParamsSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(240)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();
export const placeNoteParamsSchema = placeSlugParamsSchema.extend({ id: uuidSchema });
export const friendPutSchema = z.object({}).strict();
export const friendSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(80),
    limit: queryLimit,
  })
  .strict();
export const feedCursorSchema = z.object({ createdAt: instantSchema, id: uuidSchema }).strict();
export const feedQuerySchema = z
  .object({
    cursor: z
      .string()
      .min(1)
      .max(512)
      .refine((value) => {
        try {
          decodeFeedCursor(value);
          return true;
        } catch {
          return false;
        }
      }, "Invalid feed cursor")
      .optional(),
    limit: queryLimit,
  })
  .strict() satisfies z.ZodType<FeedQuery, z.ZodTypeDef, unknown>;
export const leaderboardQuerySchema = z
  .object({
    scope: z.enum(["friends", "city", "global"]).default("friends"),
    city: locality.optional(),
    country: countrySchema.optional(),
    limit: queryLimit,
    offset: queryNumber(z.number().int().min(0).max(10_000)).default(0),
  })
  .strict()
  .refine(
    (q) => (q.scope === "city" ? Boolean(q.city && q.country) : !q.city && !q.country),
    "City scope requires city and country; other scopes omit both",
  ) satisfies z.ZodType<LeaderboardQuery, z.ZodTypeDef, unknown>;
export const trendingQuerySchema = z
  .object({
    city: locality,
    country: countrySchema,
    limit: queryLimit,
  })
  .strict() satisfies z.ZodType<TrendingQuery, z.ZodTypeDef, unknown>;

export function encodeFeedCursor(value: z.infer<typeof feedCursorSchema>): string {
  return Buffer.from(JSON.stringify(feedCursorSchema.parse(value))).toString("base64url");
}
export function decodeFeedCursor(value: string): z.infer<typeof feedCursorSchema> {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw new Error("Invalid feed cursor");
  return feedCursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
}
