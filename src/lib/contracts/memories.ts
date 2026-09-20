import { z } from "zod";
import {
  MEMORY_LIMITS,
  MEMORY_MIME_TYPES,
  TASTE_INTERESTS,
} from "../../../shared/memories-contract";
import type * as DTO from "../../../shared/memories-contract";
import { instantSchema, timezoneSchema, uuidSchema } from "./primitives";

const version = z.number().int().min(1).max(2_147_483_647);
const title = z.string().trim().min(1).max(120);
const note = z.string().trim().max(2000);
const groupKey = z.string().trim().min(1).max(80);
const uniqueIds = (max: number) =>
  z
    .array(uuidSchema)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs");
const nonemptyPatch = (input: object) => Object.keys(input).length > 1;
export const memoryVersionSchema = z
  .object({ expectedVersion: version })
  .strict() satisfies z.ZodType<DTO.MemoryMutation>;
export const memoryPageQuerySchema = z
  .object({
    cursor: uuidSchema.optional(),
    limit: z
      .preprocess(
        (value) => (typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value),
        z.number().int().min(1).max(MEMORY_LIMITS.pageSize),
      )
      .default(25),
  })
  .strict() satisfies z.ZodType<DTO.MemoryPageQuery, z.ZodTypeDef, unknown>;
export const importBatchParamsSchema = z.object({ batchId: uuidSchema }).strict();
export const importItemParamsSchema = importBatchParamsSchema.extend({ itemId: uuidSchema });
export const albumParamsSchema = z.object({ albumId: uuidSchema }).strict();
export const albumMemberParamsSchema = albumParamsSchema.extend({ memberId: uuidSchema });
export const momentParamsSchema = z.object({ momentId: uuidSchema }).strict();
export const momentTagParamsSchema = momentParamsSchema.extend({ tagId: uuidSchema });
export const tasteUserParamsSchema = z.object({ userId: uuidSchema }).strict();
export const tasteInterestSchema = z.enum(TASTE_INTERESTS);
export const memoryAnalysisSchema = z
  .object({
    version: z.literal(1),
    interests: z
      .array(tasteInterestSchema)
      .max(10)
      .refine((values) => new Set(values).size === values.length, "Duplicate interests"),
    scene: z.string().trim().max(240).nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict() satisfies z.ZodType<DTO.MemoryAnalysis>;
export const importMetadataSchema = z
  .object({
    capturedAt: instantSchema.nullable(),
    timezone: timezoneSchema.nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    accuracyM: z.number().min(0).max(20_000_000).nullable(),
    origin: z.enum(["exif", "manual", "unknown"]),
  })
  .strict()
  .refine(
    (input) => (input.latitude === null) === (input.longitude === null),
    "Supply both coordinates",
  )
  .refine(
    (input) => input.accuracyM === null || input.latitude !== null,
    "Accuracy requires coordinates",
  ) satisfies z.ZodType<DTO.ImportMetadata>;
export const confirmedMemoryStopSchema = z
  .object({
    placeId: uuidSchema,
    capturedAt: instantSchema,
    timezone: timezoneSchema,
  })
  .strict() satisfies z.ZodType<DTO.ConfirmedMemoryStop>;
export const importBatchCreateSchema = z
  .object({ requestId: uuidSchema, title })
  .strict() satisfies z.ZodType<DTO.ImportBatchCreate>;
export const importItemCreateSchema = z
  .object({
    requestId: uuidSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[/\\\u0000-\u001f]/.test(value), "Use a file name, not a path"),
    contentType: z.enum(MEMORY_MIME_TYPES),
    sizeBytes: z.number().int().min(1).max(MEMORY_LIMITS.imageBytes),
    metadata: importMetadataSchema,
  })
  .strict() satisfies z.ZodType<DTO.ImportItemCreate>;
export const importItemPatchSchema = z
  .object({
    expectedVersion: version,
    groupKey: groupKey.nullable().optional(),
    confirmedStop: confirmedMemoryStopSchema.nullable().optional(),
    metadata: importMetadataSchema.optional(),
  })
  .strict()
  .refine(nonemptyPatch, "Supply an edit") satisfies z.ZodType<DTO.ImportItemPatch>;
export const importAnalyzeSchema = z
  .object({
    requestId: uuidSchema,
    expectedVersion: version,
    itemIds: uniqueIds(MEMORY_LIMITS.analysisItems).refine(
      (ids) => ids.length > 0,
      "Select images",
    ),
    consentImages: z.literal(true),
  })
  .strict() satisfies z.ZodType<DTO.ImportAnalyzeRequest>;
export const memoryTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("private") }).strict(),
  z
    .object({ kind: z.literal("album"), albumId: uuidSchema, confirmShare: z.literal(true) })
    .strict(),
]) satisfies z.ZodType<DTO.MemoryTarget>;
export const importCommitSchema = z
  .object({
    requestId: uuidSchema,
    expectedVersion: version,
    target: memoryTargetSchema,
    items: z
      .array(
        z.object({ itemId: uuidSchema, createVisit: z.boolean(), note: note.nullable() }).strict(),
      )
      .min(1)
      .max(MEMORY_LIMITS.batchItems)
      .refine(
        (items) => new Set(items.map((item) => item.itemId)).size === items.length,
        "Duplicate items",
      ),
  })
  .strict() satisfies z.ZodType<DTO.ImportCommitRequest>;
export const tasteSourceRefSchema = z
  .object({
    kind: z.enum(["edition", "import_item", "saved_place", "favorite", "recommendation"]),
    id: uuidSchema,
  })
  .strict() satisfies z.ZodType<DTO.TasteSourceRef>;
const sources = z
  .array(tasteSourceRefSchema)
  .max(MEMORY_LIMITS.sourceCount)
  .refine(
    (values) => new Set(values.map((value) => `${value.kind}:${value.id}`)).size === values.length,
    "Duplicate sources",
  );
const intent = z.enum(["enjoyed", "want_to_try"]);
const strength = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const tasteFacetSchema = z
  .object({ interest: tasteInterestSchema, intent, strength })
  .strict() satisfies z.ZodType<DTO.TasteFacet>;
export const tasteDraftFacetSchema = tasteFacetSchema.extend({
  evidenceIds: uniqueIds(MEMORY_LIMITS.sourceCount),
}) satisfies z.ZodType<DTO.TasteDraftFacet>;
const distinctFacets = (facets: { interest: string; intent: string }[]) =>
  new Set(facets.map((facet) => `${facet.interest}:${facet.intent}`)).size === facets.length;
export const tasteDraftSchema = z
  .object({
    title: title.nullable(),
    facets: z
      .array(tasteDraftFacetSchema)
      .max(MEMORY_LIMITS.interests)
      .refine(distinctFacets, "Duplicate facets"),
    coverage: z.enum(["insufficient", "ready"]),
  })
  .strict() satisfies z.ZodType<DTO.TasteDraft>;
export const tastePreferencesSchema = z
  .object({
    pace: z.enum(["relaxed", "balanced", "busy"]).nullable(),
    budget: z.enum(["free", "moderate", "flexible"]).nullable(),
    accessibility: z.string().trim().max(500).nullable(),
  })
  .strict() satisfies z.ZodType<DTO.TastePreferences>;
export const tasteOverrideSchema = tasteFacetSchema.extend({
  action: z.enum(["prefer", "dismiss"]),
}) satisfies z.ZodType<DTO.TasteOverride>;
export const tasteAnalyzeSchema = z
  .object({
    requestId: uuidSchema,
    expectedVersion: version,
    sources,
    note: note.optional(),
    consentImages: z.boolean(),
  })
  .strict()
  .refine(
    (input) => input.sources.length > 0 || Boolean(input.note),
    "Select sources or add a note",
  )
  .refine(
    (input) =>
      input.consentImages || !input.sources.some((source) => source.kind === "import_item"),
    "Image analysis requires consent",
  ) satisfies z.ZodType<DTO.TasteAnalyzeRequest>;
export const tasteProfilePatchSchema = z
  .object({
    expectedVersion: version,
    titleOverride: title.nullable().optional(),
    overrides: z
      .array(tasteOverrideSchema)
      .max(MEMORY_LIMITS.interests)
      .refine(distinctFacets, "Duplicate overrides")
      .optional(),
    preferences: tastePreferencesSchema.optional(),
    excludedSources: sources.optional(),
    collageMomentIds: uniqueIds(MEMORY_LIMITS.collageItems).optional(),
  })
  .strict()
  .refine(nonemptyPatch, "Supply an edit") satisfies z.ZodType<DTO.TasteProfilePatch>;
export const tastePublishSchema = z
  .object({
    expectedVersion: version,
    sharing: z.enum(["private", "friends"]),
    title: title.nullable(),
    facets: z
      .array(tasteFacetSchema)
      .max(MEMORY_LIMITS.interests)
      .refine(distinctFacets, "Duplicate facets"),
    collageMomentIds: uniqueIds(MEMORY_LIMITS.collageItems),
    confirmShare: z.boolean(),
  })
  .strict()
  .refine(
    (input) => input.sharing === "private" || input.confirmShare,
    "Sharing requires confirmation",
  ) satisfies z.ZodType<DTO.TastePublishRequest>;
export const tasteComparisonQuerySchema = z
  .object({
    city: z.string().trim().min(1).max(200).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict()
  .refine(
    (input) => !input.city || input.country,
    "City requires country",
  ) satisfies z.ZodType<DTO.TasteComparisonQuery>;
export const tripAlbumCreateSchema = z
  .object({
    requestId: uuidSchema,
    title,
    description: note.nullable().optional(),
    outingId: uuidSchema.nullable().optional(),
    sourceBatchId: uuidSchema.nullable().optional(),
  })
  .strict() satisfies z.ZodType<DTO.TripAlbumCreate>;
export const tripAlbumPatchSchema = z
  .object({
    expectedVersion: version,
    title: title.optional(),
    description: note.nullable().optional(),
  })
  .strict()
  .refine(nonemptyPatch, "Supply an edit") satisfies z.ZodType<DTO.TripAlbumPatch>;
export const albumMemberInviteSchema = z
  .object({ requestId: uuidSchema, userId: uuidSchema })
  .strict() satisfies z.ZodType<DTO.AlbumMemberInvite>;
export const invitationRespondSchema = z
  .object({
    expectedVersion: version,
    state: z.enum(["accepted", "declined", "removed"]),
  })
  .strict() satisfies z.ZodType<DTO.InvitationRespond>;
export const memoryMediaSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("edition"), id: uuidSchema }).strict(),
  z.object({ kind: z.literal("import_item"), id: uuidSchema }).strict(),
]) satisfies z.ZodType<DTO.MemoryMediaSource>;
export const memoryMomentCreateSchema = z
  .object({
    requestId: uuidSchema,
    source: memoryMediaSourceSchema,
    target: memoryTargetSchema,
    confirmedStop: confirmedMemoryStopSchema.nullable().optional(),
    groupKey: groupKey.nullable().optional(),
    note: note.nullable().optional(),
  })
  .strict() satisfies z.ZodType<DTO.MemoryMomentCreate>;
export const memoryMomentPatchSchema = z
  .object({
    expectedVersion: version,
    note: note.nullable().optional(),
    groupKey: groupKey.nullable().optional(),
    confirmedStop: confirmedMemoryStopSchema.nullable().optional(),
  })
  .strict()
  .refine(nonemptyPatch, "Supply an edit") satisfies z.ZodType<DTO.MemoryMomentPatch>;
export const momentTagCreateSchema = z
  .object({
    requestId: uuidSchema,
    userId: uuidSchema,
    confirmShare: z.literal(true),
  })
  .strict() satisfies z.ZodType<DTO.MomentTagCreate>;
