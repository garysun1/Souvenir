import { z } from "zod";
import type {
  EditionCreate,
  EditionPatch,
  PhotoUploadRequest,
  PlacePreferencePut,
  PlanCreate,
  ProfilePatch,
  RankingPut,
  WishlistCreate,
  WishlistItemPut,
} from "../../../shared/api-contract";
import { categorySchema, editionVariantSchema, sentimentSchema } from "@/lib/schemas";
import { countrySchema, visibilitySchema } from "@/lib/schemas/worldwide";
import { instantSchema, timezoneSchema, uuidSchema } from "./primitives";

export * from "./worldwide";
export * from "./metrics";
export { instantSchema, timezoneSchema, uuidSchema } from "./primitives";
const companionsSchema = z.array(z.string().trim().min(1).max(100)).max(30);
const noteSchema = z.string().max(2000).nullable();
const photoPathSchema = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/);
export const editionCreateSchema = z
  .object({
    requestId: uuidSchema,
    placeId: uuidSchema,
    capturedAt: instantSchema,
    timezone: timezoneSchema,
    note: noteSchema.optional(),
    companions: companionsSchema.optional(),
    variant: editionVariantSchema.optional(),
    photoPath: photoPathSchema.nullable().optional(),
    origin: z.enum(["capture", "import"]).optional(),
    importSourceId: z.string().min(1).max(200).nullable().optional(),
    outingId: uuidSchema.nullable().optional(),
    visibility: visibilitySchema.optional(),
  })
  .strict()
  .refine(
    (input) => (input.origin === "import") === Boolean(input.importSourceId),
    "Imports require a stable importSourceId; captures must omit it",
  ) satisfies z.ZodType<EditionCreate>;
export const editionPatchSchema = z
  .object({
    capturedAt: instantSchema.optional(),
    timezone: timezoneSchema.optional(),
    note: noteSchema.optional(),
    companions: companionsSchema.optional(),
    visibility: visibilitySchema.optional(),
  })
  .strict()
  .refine(
    (input) => Object.keys(input).length > 0,
    "Supply an edit",
  ) satisfies z.ZodType<EditionPatch>;
export const photoUploadSchema = z
  .object({
    requestId: uuidSchema,
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    size: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
  })
  .strict() satisfies z.ZodType<PhotoUploadRequest>;
export const wishlistCreateSchema = z
  .object({
    requestId: uuidSchema,
    name: z.string().trim().min(1).max(120),
    isShared: z.boolean().optional(),
  })
  .strict() satisfies z.ZodType<WishlistCreate>;
export const wishlistItemPutSchema = z
  .object({
    placeId: uuidSchema,
    saved: z.boolean(),
    completed: z.boolean().optional(),
    visibility: visibilitySchema.optional(),
  })
  .strict() satisfies z.ZodType<WishlistItemPut>;
export const wishlistMemberSchema = z
  .object({
    handle: z.string().trim().min(1).max(80),
  })
  .strict();
const uniqueIds = z
  .array(uuidSchema)
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs are not allowed");
export const rankingGroupSchema = z
  .object({
    category: categorySchema,
    sentiment: sentimentSchema,
    placeIds: uniqueIds,
    provisionalIds: uniqueIds,
    ties: z.array(z.tuple([uuidSchema, uuidSchema])).max(1000),
  })
  .strict()
  .refine(
    ({ placeIds, provisionalIds, ties }) =>
      provisionalIds.every((id) => placeIds.includes(id)) &&
      ties.every(([a, b]) => a !== b && placeIds.includes(a) && placeIds.includes(b)),
    "Group references must belong to its ordered places",
  );
export const rankingPutSchema = z
  .object({
    sentiment: sentimentSchema,
    ranking: z.enum(["settled", "provisional", "unranked"]),
    comparedTo: uuidSchema.nullable().optional(),
    tiedWith: uuidSchema.nullable().optional(),
    group: rankingGroupSchema.optional(),
    visibility: visibilitySchema.optional(),
  })
  .strict()
  .refine(
    (input) => !input.group || input.group.sentiment === input.sentiment,
    "Assessment and group sentiments must agree",
  ) satisfies z.ZodType<RankingPut>;
export const placePreferencePutSchema = z
  .object({
    favorite: z.boolean().optional(),
    tip: z.string().max(280).optional(),
  })
  .strict()
  .refine(
    (input) => Object.keys(input).length > 0,
    "Supply an edit",
  ) satisfies z.ZodType<PlacePreferencePut>;
const minute = z.number().int().min(0).max(1440);
export const planContentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    constraints: z
      .object({
        participantIds: uniqueIds,
        date: z.string().date(),
        startMinute: minute,
        endMinute: minute,
        budgetCents: z.number().int().nonnegative(),
        transport: z.enum(["walk", "transit"]),
        interests: z.array(categorySchema).max(5),
        rain: z.boolean(),
        excludedPlaceIds: uniqueIds,
        preferredPlaceIds: uniqueIds,
      })
      .strict()
      .refine((input) => input.endMinute > input.startMinute, "Invalid time window"),
    stops: z
      .array(
        z
          .object({
            placeId: uuidSchema,
            arrivalMinute: minute,
            departureMinute: minute,
            costCents: z.number().int().nonnegative(),
            travelMinutes: z.number().int().nonnegative(),
          })
          .strict()
          .refine((stop) => stop.departureMinute >= stop.arrivalMinute, "Invalid stop"),
      )
      .min(1)
      .max(30),
    totalCostCents: z.number().int().nonnegative(),
    totalMinutes: z.number().int().nonnegative(),
    checks: z.array(z.string().max(500)).max(100),
    version: z.number().int().positive(),
    provenance: z.enum(["simulation", "manual"]),
  })
  .strict();
export const planCreateSchema = z
  .object({
    requestId: uuidSchema,
    wishlistId: uuidSchema.nullable().optional(),
    plan: planContentSchema,
  })
  .strict() satisfies z.ZodType<PlanCreate>;
export const profilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    homeCity: z.string().trim().max(100).nullable().optional(),
    homeCountry: countrySchema.nullable().optional(),
    statsVisibility: visibilitySchema.optional(),
  })
  .strict()
  .refine(
    (input) => Object.keys(input).length > 0,
    "Supply an edit",
  ) satisfies z.ZodType<ProfilePatch>;
