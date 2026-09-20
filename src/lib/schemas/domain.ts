import { z } from "zod";
import {
  countrySchema,
  latitudeSchema,
  longitudeSchema,
  placeSourceSchema,
  visibilitySchema,
} from "./worldwide";

export const categorySchema = z.enum(["nature", "culture", "food", "landmark", "hidden_gem"]);
export const rarityTierSchema = z.enum(["common", "uncommon", "rare", "epic", "legendary"]);
export const editionVariantSchema = z.enum(["standard", "revisit", "group", "seasonal"]);
export const friendshipStatusSchema = z.enum(["pending", "accepted"]);
export const sentimentSchema = z.enum(["recommend", "depends", "skip"]);
export type Sentiment = z.infer<typeof sentimentSchema>;

export const placeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  category: categorySchema,
  lat: latitudeSchema,
  lng: longitudeSchema,
  city: z.string().nullable(),
  country: countrySchema.nullable().optional(),
  region: z.string().max(200).nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  website: z.string().url().nullable().optional(),
  wikidataId: z
    .string()
    .regex(/^Q[1-9]\d*$/)
    .nullable()
    .optional(),
  source: placeSourceSchema.optional(),
  sourceUpdatedAt: z.coerce.date().nullable().optional(),
  fetchedAt: z.coerce.date().nullable().optional(),
  visibility: visibilitySchema.optional(),
  description: z.string(),
  heroImageUrl: z.string().url().nullable(),
  rarityTier: rarityTierSchema,
  rarityAppeal: z.number().min(0).max(100),
  rarityDiscoveryFreq: z.number().min(0).max(100),
  rarityAvailability: z.number().min(0).max(100),
  externalIds: z.record(z.string()).nullable(),
  stats: z.record(z.unknown()).nullable(),
  createdAt: z.coerce.date(),
});
export type Place = z.infer<typeof placeSchema>;

export const editionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  placeId: z.string(),
  photoUrl: z.string().url().nullable(),
  capturedAt: z.coerce.date(),
  note: z.string().nullable(),
  companions: z.array(z.string()),
  variant: editionVariantSchema,
  confidence: z.number().min(0).max(1).nullable(),
  createdAt: z.coerce.date(),
});
export type Edition = z.infer<typeof editionSchema>;

export const collectionSetSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  coverImageUrl: z.string().url().nullable(),
  city: z.string(),
  places: z.array(placeSchema),
});
export type CollectionSet = z.infer<typeof collectionSetSchema>;

export const userSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  homeCity: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof userSchema>;

export const wishlistSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  isShared: z.boolean(),
  placeIds: z.array(z.string()),
});
export type Wishlist = z.infer<typeof wishlistSchema>;

export const outingSchema = z.object({
  id: z.string(),
  wishlistId: z.string().nullable(),
  plannedFor: z.coerce.date().nullable(),
  plan: z.record(z.unknown()),
  createdBy: z.string(),
  memberIds: z.array(z.string()),
});
export type Outing = z.infer<typeof outingSchema>;
