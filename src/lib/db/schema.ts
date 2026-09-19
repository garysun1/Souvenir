import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const categoryEnum = pgEnum("category", ["nature", "culture", "food", "landmark", "hidden_gem"]);
export const rarityTierEnum = pgEnum("rarity_tier", ["common", "uncommon", "rare", "epic", "legendary"]);
export const editionVariantEnum = pgEnum("edition_variant", ["standard", "revisit", "group", "seasonal"]);
export const friendshipStatusEnum = pgEnum("friendship_status", ["pending", "accepted"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  homeCity: text("home_city"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const places = pgTable("places", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: categoryEnum("category").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  city: text("city").notNull(),
  description: text("description").notNull(),
  heroImageUrl: text("hero_image_url"),
  rarityTier: rarityTierEnum("rarity_tier").notNull(),
  rarityAppeal: integer("rarity_appeal").notNull(),
  rarityDiscoveryFreq: integer("rarity_discovery_freq").notNull(),
  rarityAvailability: integer("rarity_availability").notNull(),
  externalIds: jsonb("external_ids").$type<Record<string, string>>(),
  stats: jsonb("stats").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const editions = pgTable(
  "editions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    placeId: uuid("place_id").notNull().references(() => places.id),
    photoUrl: text("photo_url"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
    note: text("note"),
    companions: text("companions").array().notNull().default([]),
    variant: editionVariantEnum("variant").notNull().default("standard"),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("editions_user_place_variant_unique").on(table.userId, table.placeId, table.variant)],
);

export const sets = pgTable("sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  coverImageUrl: text("cover_image_url"),
  city: text("city").notNull(),
});

export const setPlaces = pgTable("set_places", {
  setId: uuid("set_id").notNull().references(() => sets.id),
  placeId: uuid("place_id").notNull().references(() => places.id),
  position: integer("position").notNull(),
}, (table) => [unique("set_places_set_place_unique").on(table.setId, table.placeId)]);

export const wishlists = pgTable("wishlists", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  isShared: boolean("is_shared").notNull().default(false),
});

export const wishlistItems = pgTable("wishlist_items", {
  wishlistId: uuid("wishlist_id").notNull().references(() => wishlists.id),
  placeId: uuid("place_id").notNull().references(() => places.id),
  addedBy: uuid("added_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique("wishlist_items_unique").on(table.wishlistId, table.placeId)]);

export const friendships = pgTable("friendships", {
  userId: uuid("user_id").notNull().references(() => users.id),
  friendId: uuid("friend_id").notNull().references(() => users.id),
  status: friendshipStatusEnum("status").notNull().default("pending"),
}, (table) => [unique("friendships_unique").on(table.userId, table.friendId)]);

export const outings = pgTable("outings", {
  id: uuid("id").defaultRandom().primaryKey(),
  wishlistId: uuid("wishlist_id").references(() => wishlists.id),
  plannedFor: timestamp("planned_for", { withTimezone: true }),
  plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
});

export const outingMembers = pgTable("outing_members", {
  outingId: uuid("outing_id").notNull().references(() => outings.id),
  userId: uuid("user_id").notNull().references(() => users.id),
}, (table) => [unique("outing_members_unique").on(table.outingId, table.userId)]);

export const rankings = pgTable("rankings", {
  userId: uuid("user_id").notNull().references(() => users.id),
  placeId: uuid("place_id").notNull().references(() => places.id),
  wouldRecommend: boolean("would_recommend").notNull(),
  rankScore: real("rank_score"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique("rankings_user_place_unique").on(table.userId, table.placeId)]);

export const placeRelations = relations(places, ({ many }) => ({ editions: many(editions), setPlaces: many(setPlaces) }));
export const setRelations = relations(sets, ({ many }) => ({ setPlaces: many(setPlaces) }));
export const userRelations = relations(users, ({ many }) => ({ editions: many(editions), wishlists: many(wishlists) }));
