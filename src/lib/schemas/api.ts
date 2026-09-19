import { z } from "zod";
import { categorySchema, placeSchema } from "./domain";

export const searchQuerySchema = z.object({
  q: z.string().default(""),
  lat: z.number().optional(),
  lng: z.number().optional(),
  radiusKm: z.number().positive().max(200).default(25),
  category: categorySchema.optional(),
  limit: z.number().int().positive().max(100).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResultSchema = z.object({
  place: placeSchema,
  distanceKm: z.number().nonnegative().nullable(),
  score: z.number(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const identifyRequestSchema = z.object({
  imageUrl: z.string().url(),
});
export type IdentifyRequest = z.infer<typeof identifyRequestSchema>;

export const identifyResponseSchema = z.object({
  candidates: z.array(z.object({ place: placeSchema, confidence: z.number().min(0).max(1) })),
});
export type IdentifyResponse = z.infer<typeof identifyResponseSchema>;

export const planRequestSchema = z.object({
  placeIds: z.array(z.string()).default([]),
  query: z.string().min(1),
  date: z.string().optional(),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;

export const planResponseSchema = z.object({
  title: z.string(),
  summary: z.string(),
  places: z.array(placeSchema),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;

export const editionCreateRequestSchema = z.object({
  placeId: z.string(),
  photoUrl: z.string().url().nullable().optional(),
  capturedAt: z.coerce.date().optional(),
  note: z.string().max(2000).nullable().optional(),
  companions: z.array(z.string()).default([]),
  variant: z.enum(["standard", "revisit", "group", "seasonal"]).default("standard"),
  confidence: z.number().min(0).max(1).nullable().optional(),
});
export type EditionCreateRequest = z.infer<typeof editionCreateRequestSchema>;

export const rankingRequestSchema = z.object({
  wouldRecommend: z.boolean(),
  rankScore: z.number().optional(),
});

export const wishlistCreateRequestSchema = z.object({
  name: z.string().min(1).max(120),
  isShared: z.boolean().default(false),
});

export const wishlistItemRequestSchema = z.object({ placeId: z.string() });
