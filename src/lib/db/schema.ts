import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { CityRankDto, PlaceCorrectionValue } from "../../../shared/worldwide-contract";

export const categoryEnum = pgEnum("category", [
  "nature",
  "culture",
  "food",
  "landmark",
  "hidden_gem",
]);
export const rarityTierEnum = pgEnum("rarity_tier", [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
]);
export const editionVariantEnum = pgEnum("edition_variant", [
  "standard",
  "revisit",
  "group",
  "seasonal",
]);
export const friendshipStatusEnum = pgEnum("friendship_status", ["pending", "accepted"]);
export const sentimentEnum = pgEnum("sentiment", ["recommend", "depends", "skip"]);
export const rankingStatusEnum = pgEnum("ranking_status", ["settled", "provisional", "unranked"]);
export const visibilityEnum = pgEnum("visibility", ["private", "friends", "public"]);
export const placeSourceEnum = pgEnum("place_source", [
  "curated",
  "osm",
  "wikidata",
  "wikimedia",
  "google",
  "opentripmap",
  "user",
  "placeholder",
]);
export const noteKindEnum = pgEnum("place_note_kind", [
  "tip",
  "warning",
  "hours",
  "access",
  "story",
]);
export const suggestionStatusEnum = pgEnum("suggestion_status", [
  "pending",
  "accepted",
  "rejected",
]);
export const sampleStatusEnum = pgEnum("sample_status", [
  "unavailable",
  "insufficient",
  "ready",
  "stale",
]);
export const activityKindEnum = pgEnum("activity_kind", [
  "edition",
  "ranking",
  "note",
  "set_complete",
  "friend",
]);
export const retentionPolicyEnum = pgEnum("retention_policy", [
  "metadata_only",
  "do_not_store",
  "expiring",
  "licensed",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  homeCity: text("home_city"),
  homeCountry: text("home_country"),
  statsVisibility: visibilityEnum("stats_visibility").notNull().default("private"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const places = pgTable(
  "places",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: categoryEnum("category").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    city: text("city"),
    country: text("country"),
    region: text("region"),
    timezone: text("timezone"),
    website: text("website"),
    wikidataId: text("wikidata_id"),
    source: placeSourceEnum("source").notNull().default("curated"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    geohash: text("geohash"),
    ownerId: uuid("owner_id").references(() => users.id),
    visibility: visibilityEnum("visibility").notNull().default("public"),
    requestId: uuid("request_id"),
    description: text("description").notNull(),
    heroImageUrl: text("hero_image_url"),
    rarityTier: rarityTierEnum("rarity_tier").notNull(),
    rarityAppeal: integer("rarity_appeal").notNull(),
    rarityDiscoveryFreq: integer("rarity_discovery_freq").notNull(),
    rarityAvailability: integer("rarity_availability").notNull(),
    externalIds: jsonb("external_ids").$type<Record<string, string>>(),
    stats: jsonb("stats").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("places_geohash_idx").on(table.geohash),
    index("places_coordinates_idx").on(table.lat, table.lng),
    index("places_locality_idx").on(table.country, table.city, table.category),
    index("places_owner_idx").on(table.ownerId),
    uniqueIndex("places_wikidata_unique").on(table.wikidataId),
    unique("places_owner_request_unique").on(table.ownerId, table.requestId),
    check(
      "places_coordinates_valid",
      sql`${table.lat} BETWEEN -90 AND 90 AND ${table.lng} BETWEEN -180 AND 180`,
    ),
    check("places_country_valid", sql`${table.country} IS NULL OR ${table.country} ~ '^[A-Z]{2}$'`),
    check(
      "places_user_owner_required",
      sql`${table.source} <> 'user' OR ${table.ownerId} IS NOT NULL`,
    ),
  ],
);

export const editions = pgTable(
  "editions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id),
    photoUrl: text("photo_url"),
    photoPath: text("photo_path"),
    requestId: uuid("request_id").notNull(),
    visitSequence: integer("visit_sequence").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    origin: text("origin").notNull().default("capture"),
    importSourceId: text("import_source_id"),
    outingId: uuid("outing_id").references(() => outings.id, { onDelete: "set null" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
    note: text("note"),
    companions: text("companions").array().notNull().default([]),
    variant: editionVariantEnum("variant").notNull().default("standard"),
    confidence: real("confidence"),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("editions_user_request_unique").on(table.userId, table.requestId),
    unique("editions_user_place_sequence_unique").on(
      table.userId,
      table.placeId,
      table.visitSequence,
    ),
    unique("editions_user_import_unique").on(table.userId, table.importSourceId),
    unique("editions_event_identity_unique").on(table.id, table.userId, table.placeId),
    index("editions_place_captured_user_idx").on(table.placeId, table.capturedAt, table.userId),
    index("editions_user_captured_idx").on(table.userId, table.capturedAt),
  ],
);

export const sets = pgTable("sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  coverImageUrl: text("cover_image_url"),
  city: text("city").notNull(),
});

export const setPlaces = pgTable(
  "set_places",
  {
    setId: uuid("set_id")
      .notNull()
      .references(() => sets.id),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id),
    position: integer("position").notNull(),
  },
  (table) => [unique("set_places_set_place_unique").on(table.setId, table.placeId)],
);

export const wishlists = pgTable(
  "wishlists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    isShared: boolean("is_shared").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (table) => [
    uniqueIndex("wishlists_owner_default_unique")
      .on(table.ownerId)
      .where(sql`${table.isDefault}`),
  ],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id),
    addedBy: uuid("added_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("wishlist_items_unique").on(table.wishlistId, table.placeId)],
);

export const friendships = pgTable(
  "friendships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => users.id),
    status: friendshipStatusEnum("status").notNull().default("pending"),
  },
  (table) => [
    unique("friendships_unique").on(table.userId, table.friendId),
    index("friendships_friend_status_idx").on(table.friendId, table.status),
    index("friendships_user_status_idx").on(table.userId, table.status),
  ],
);

export const outings = pgTable("outings", {
  id: uuid("id").defaultRandom().primaryKey(),
  wishlistId: uuid("wishlist_id").references(() => wishlists.id),
  plannedFor: timestamp("planned_for", { withTimezone: true }),
  plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  requestId: uuid("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const outingMembers = pgTable(
  "outing_members",
  {
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [unique("outing_members_unique").on(table.outingId, table.userId)],
);

export const rankings = pgTable(
  "rankings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id),
    wouldRecommend: boolean("would_recommend").notNull(),
    rankScore: real("rank_score"),
    sentiment: sentimentEnum("sentiment").notNull(),
    ranking: rankingStatusEnum("ranking").notNull().default("unranked"),
    comparedTo: uuid("compared_to").references(() => places.id),
    tiedWith: uuid("tied_with").references(() => places.id),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("rankings_user_place_unique").on(table.userId, table.placeId),
    index("rankings_place_sentiment_idx").on(table.placeId, table.sentiment),
  ],
);

export const apiRequests = pgTable(
  "api_requests",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    requestId: uuid("request_id").notNull(),
    operation: text("operation").notNull(),
    requestHash: text("request_hash").notNull(),
    resourceId: uuid("resource_id"),
    resourcePath: text("resource_path"),
    importSourceId: text("import_source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.requestId] }),
    unique("api_requests_user_import_unique").on(table.userId, table.importSourceId),
  ],
);

export const editionCounters = pgTable(
  "edition_counters",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id),
    lastSequence: integer("last_sequence").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.placeId] })],
);

export const wishlistMembers = pgTable(
  "wishlist_members",
  {
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [primaryKey({ columns: [table.wishlistId, table.userId] })],
);

export const wishlistSaves = pgTable(
  "wishlist_saves",
  {
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    completed: boolean("completed").notNull().default(false),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.wishlistId, table.placeId, table.userId] }),
    index("wishlist_saves_place_user_idx").on(table.placeId, table.userId),
  ],
);

export const placePreferences = pgTable(
  "place_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id),
    favorite: boolean("favorite").notNull().default(false),
    tip: text("tip").notNull().default(""),
  },
  (table) => [primaryKey({ columns: [table.userId, table.placeId] })],
);

export const rankingGroups = pgTable(
  "ranking_groups",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    category: categoryEnum("category").notNull(),
    sentiment: sentimentEnum("sentiment").notNull(),
    placeIds: jsonb("place_ids").$type<string[]>().notNull().default([]),
    provisionalIds: jsonb("provisional_ids").$type<string[]>().notNull().default([]),
    ties: jsonb("ties").$type<[string, string][]>().notNull().default([]),
  },
  (table) => [primaryKey({ columns: [table.userId, table.category, table.sentiment] })],
);

export const placeSources = pgTable(
  "place_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    provider: placeSourceEnum("provider").notNull(),
    providerId: text("provider_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    retentionPolicy: retentionPolicyEnum("retention_policy").notNull().default("metadata_only"),
    retainedFields: text("retained_fields").array().notNull().default([]),
    policyUrl: text("policy_url"),
    policyCheckedAt: timestamp("policy_checked_at", { withTimezone: true }),
    license: text("license"),
    licenseUrl: text("license_url"),
    attribution: text("attribution"),
    sourceUrl: text("source_url"),
    status: sampleStatusEnum("status").notNull().default("unavailable"),
  },
  (table) => [
    unique("place_sources_provider_key_unique").on(table.provider, table.providerId),
    index("place_sources_place_idx").on(table.placeId),
    index("place_sources_expiry_idx").on(table.expiresAt),
    check(
      "place_sources_retention_valid",
      sql`
    (${table.retentionPolicy} NOT IN ('metadata_only', 'do_not_store') OR ${table.payload} IS NULL)
    AND (${table.retentionPolicy} <> 'expiring' OR ${table.expiresAt} > ${table.fetchedAt})
    AND (${table.retentionPolicy} <> 'expiring' OR ${table.expiresAt} IS NOT NULL)
    AND (${table.payload} IS NULL OR (${table.policyUrl} IS NOT NULL AND ${table.policyCheckedAt} IS NOT NULL))
    AND (${table.provider} <> 'google' OR (${table.payload} IS NULL AND ${table.retentionPolicy} IN ('metadata_only', 'do_not_store')))
  `,
    ),
  ],
).enableRLS();

export const placeImages = pgTable(
  "place_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => placeSources.id, { onDelete: "set null" }),
    provider: placeSourceEnum("provider").notNull(),
    providerId: text("provider_id"),
    url: text("url").notNull(),
    width: integer("width"),
    height: integer("height"),
    license: text("license").notNull(),
    licenseUrl: text("license_url"),
    attribution: text("attribution").notNull(),
    sourcePageUrl: text("source_page_url").notNull(),
    isHero: boolean("is_hero").notNull().default(false),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    requestId: uuid("request_id"),
    storagePath: text("storage_path"),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("place_images_place_idx").on(table.placeId),
    unique("place_images_provider_key_unique").on(table.placeId, table.provider, table.providerId),
    unique("place_images_upload_request_unique").on(table.uploadedBy, table.requestId),
    uniqueIndex("place_images_hero_unique")
      .on(table.placeId)
      .where(sql`${table.isHero}`),
    check(
      "place_images_dimensions_valid",
      sql`(${table.width} IS NULL OR ${table.width} > 0) AND (${table.height} IS NULL OR ${table.height} > 0)`,
    ),
    check(
      "place_images_public_copy_only",
      sql`${table.storagePath} IS NULL OR ${table.storagePath} LIKE 'place-images/%'`,
    ),
    check(
      "place_images_user_consent",
      sql`${table.provider} <> 'user' OR (${table.uploadedBy} IS NOT NULL AND ${table.consentedAt} IS NOT NULL)`,
    ),
  ],
).enableRLS();

export const placeNotes = pgTable(
  "place_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    kind: noteKindEnum("kind").notNull(),
    body: text("body").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    legacyTip: boolean("legacy_tip").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("place_notes_user_request_unique").on(table.userId, table.requestId),
    unique("place_notes_event_identity_unique").on(table.id, table.userId, table.placeId),
    uniqueIndex("place_notes_legacy_tip_unique")
      .on(table.userId, table.placeId)
      .where(sql`${table.legacyTip}`),
    index("place_notes_place_visibility_idx").on(table.placeId, table.visibility, table.createdAt),
    check("place_notes_body_valid", sql`length(btrim(${table.body})) BETWEEN 1 AND 600`),
    check(
      "place_notes_legacy_tip_private",
      sql`NOT ${table.legacyTip} OR (${table.visibility} = 'private' AND ${table.kind} = 'tip')`,
    ),
  ],
).enableRLS();

export const placeTags = pgTable(
  "place_tags",
  {
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.placeId, table.userId, table.tag] }),
    index("place_tags_user_idx").on(table.userId),
    check(
      "place_tags_slug_valid",
      sql`${table.tag} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(${table.tag}) <= 32`,
    ),
  ],
).enableRLS();

export const placeSuggestions = pgTable(
  "place_suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    field: text("field").$type<"name" | "hours" | "website" | "coords" | "closed">().notNull(),
    value: jsonb("value").$type<PlaceCorrectionValue>(),
    status: suggestionStatusEnum("status").notNull().default("pending"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("place_suggestions_user_request_unique").on(table.userId, table.requestId),
    index("place_suggestions_review_idx").on(table.status, table.createdAt),
    check(
      "place_suggestions_field_valid",
      sql`${table.field} IN ('name', 'hours', 'website', 'coords', 'closed')`,
    ),
    check(
      "place_suggestions_value_required",
      sql`${table.field} = 'website' OR (${table.value} IS NOT NULL AND jsonb_typeof(${table.value}) <> 'null')`,
    ),
  ],
).enableRLS();

export const coverageCells = pgTable(
  "coverage_cells",
  {
    geohash: text("geohash").notNull(),
    provider: placeSourceEnum("provider").notNull(),
    status: text("status").$type<"pending" | "ready" | "failed">().notNull().default("pending"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    retryAfter: timestamp("retry_after", { withTimezone: true }),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    resultCount: integer("result_count"),
  },
  (table) => [
    primaryKey({ columns: [table.geohash, table.provider] }),
    index("coverage_cells_retry_idx").on(table.retryAfter, table.leaseUntil),
    check(
      "coverage_cells_geohash_valid",
      sql`${table.geohash} ~ '^[0-9bcdefghjkmnpqrstuvwxyz]{5}$'`,
    ),
    check("coverage_cells_status_valid", sql`${table.status} IN ('pending', 'ready', 'failed')`),
    check(
      "coverage_cells_count_valid",
      sql`${table.resultCount} IS NULL OR ${table.resultCount} >= 0`,
    ),
  ],
).enableRLS();

export const placeStats = pgTable(
  "place_stats",
  {
    placeId: uuid("place_id")
      .primaryKey()
      .references(() => places.id, { onDelete: "cascade" }),
    collectors: integer("collectors").notNull().default(0),
    editions: integer("editions").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    recommend: integer("recommend").notNull().default(0),
    depends: integer("depends").notNull().default(0),
    skip: integer("skip").notNull().default(0),
    visitors90d: integer("visitors_90d").notNull().default(0),
    cityVisitors90d: integer("city_visitors_90d").notNull().default(0),
    city: text("city"),
    country: text("country"),
    collectors7d: integer("collectors_7d").notNull().default(0),
    weeklyCollectors8w: jsonb("weekly_collectors_8w").$type<number[]>().notNull().default([]),
    collectors8wAvg: doublePrecision("collectors_8w_avg"),
    discoveryFreq: doublePrecision("discovery_freq"),
    recommendRate: doublePrecision("recommend_rate"),
    trendingScore: doublePrecision("trending_score"),
    sampleStatus: sampleStatusEnum("sample_status").notNull().default("unavailable"),
    provenance: text("provenance")
      .$type<"souvenir-activity">()
      .notNull()
      .default("souvenir-activity"),
    definitionVersion: integer("definition_version").notNull().default(1),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    baselineStart: timestamp("baseline_start", { withTimezone: true }).notNull(),
    baselineEnd: timestamp("baseline_end", { withTimezone: true }).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("place_stats_trending_idx").on(table.trendingScore),
    check(
      "place_stats_counts_valid",
      sql`
    ${table.collectors} >= 0 AND ${table.editions} >= 0 AND ${table.saves} >= 0
    AND ${table.recommend} >= 0 AND ${table.depends} >= 0 AND ${table.skip} >= 0
    AND ${table.visitors90d} >= 0 AND ${table.cityVisitors90d} >= ${table.visitors90d}
    AND ${table.collectors7d} >= 0`,
    ),
    check(
      "place_stats_rates_valid",
      sql`
    (${table.discoveryFreq} IS NULL OR (${table.city} IS NOT NULL AND ${table.country} IS NOT NULL AND ${table.cityVisitors90d} >= 5 AND ${table.discoveryFreq} BETWEEN 0 AND 1 AND abs(${table.discoveryFreq} - ${table.visitors90d}::float8 / nullif(${table.cityVisitors90d}, 0)) < 1e-9))
    AND (${table.recommendRate} IS NULL OR (${table.recommend} + ${table.depends} + ${table.skip} >= 5 AND ${table.recommendRate} BETWEEN 0 AND 1 AND abs(${table.recommendRate} - ${table.recommend}::float8 / nullif(${table.recommend} + ${table.depends} + ${table.skip}, 0)) < 1e-9))
    AND (${table.trendingScore} IS NULL OR (${table.collectors8wAvg} IS NOT NULL AND ${table.collectors8wAvg} > 0 AND ${table.trendingScore} >= 0 AND ${table.trendingScore} < 'Infinity'::float8))`,
    ),
    check(
      "place_stats_windows_valid",
      sql`${table.windowEnd} - ${table.windowStart} = interval '90 days' AND ${table.baselineEnd} - ${table.baselineStart} = interval '56 days' AND ${table.baselineEnd} <= ${table.windowEnd} - interval '7 days' AND ${table.baselineEnd} > ${table.windowEnd} - interval '14 days' AND date_trunc('week', ${table.baselineEnd} AT TIME ZONE 'UTC') = ${table.baselineEnd} AT TIME ZONE 'UTC'`,
    ),
  ],
).enableRLS();

export const userStats = pgTable(
  "user_stats",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    placesVisited: integer("places_visited").notNull().default(0),
    editions: integer("editions").notNull().default(0),
    citiesVisited: integer("cities_visited").notNull().default(0),
    currentStreakWeeks: integer("current_streak_weeks").notNull().default(0),
    longestStreakWeeks: integer("longest_streak_weeks").notNull().default(0),
    globalRank: integer("global_rank"),
    cityRanks: jsonb("city_ranks").$type<CityRankDto[]>().notNull().default([]),
    sampleStatus: sampleStatusEnum("sample_status").notNull().default("unavailable"),
    provenance: text("provenance")
      .$type<"souvenir-activity">()
      .notNull()
      .default("souvenir-activity"),
    definitionVersion: integer("definition_version").notNull().default(1),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_stats_leaderboard_idx").on(table.placesVisited.desc(), table.userId),
    check(
      "user_stats_counts_valid",
      sql`${table.placesVisited} >= 0 AND ${table.editions} >= ${table.placesVisited} AND ${table.citiesVisited} >= 0 AND ${table.currentStreakWeeks} >= 0 AND ${table.longestStreakWeeks} >= ${table.currentStreakWeeks} AND (${table.globalRank} IS NULL OR ${table.globalRank} > 0)`,
    ),
  ],
).enableRLS();

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: activityKindEnum("kind").notNull(),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "cascade" }),
    editionId: uuid("edition_id"),
    noteId: uuid("note_id"),
    rankingPlaceId: uuid("ranking_place_id"),
    setId: uuid("set_id").references(() => sets.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id").references(() => users.id, { onDelete: "cascade" }),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    requestId: uuid("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.editionId, table.userId, table.placeId],
      foreignColumns: [editions.id, editions.userId, editions.placeId],
      name: "activity_events_edition_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.noteId, table.userId, table.placeId],
      foreignColumns: [placeNotes.id, placeNotes.userId, placeNotes.placeId],
      name: "activity_events_note_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId, table.rankingPlaceId],
      foreignColumns: [rankings.userId, rankings.placeId],
      name: "activity_events_ranking_fk",
    }).onDelete("cascade"),
    unique("activity_events_request_unique").on(table.userId, table.requestId, table.kind),
    uniqueIndex("activity_events_edition_unique").on(table.editionId),
    uniqueIndex("activity_events_note_unique").on(table.noteId),
    index("activity_events_user_cursor_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("activity_events_cursor_idx").on(table.createdAt.desc(), table.id.desc()),
    check(
      "activity_events_target_valid",
      sql`
    (num_nonnulls(${table.editionId}, ${table.noteId}, ${table.rankingPlaceId}, ${table.setId}, ${table.friendId}) = 1 AND (
      (${table.kind} = 'edition' AND ${table.editionId} IS NOT NULL AND ${table.placeId} IS NOT NULL) OR
      (${table.kind} = 'note' AND ${table.noteId} IS NOT NULL AND ${table.placeId} IS NOT NULL) OR
      (${table.kind} = 'ranking' AND ${table.rankingPlaceId} = ${table.placeId} AND ${table.placeId} IS NOT NULL) OR
      (${table.kind} = 'set_complete' AND ${table.setId} IS NOT NULL AND ${table.placeId} IS NULL) OR
      (${table.kind} = 'friend' AND ${table.friendId} IS NOT NULL AND ${table.placeId} IS NULL AND ${table.friendId} <> ${table.userId})
    )) IS TRUE`,
    ),
  ],
).enableRLS();

export const placeRelations = relations(places, ({ many }) => ({
  editions: many(editions),
  setPlaces: many(setPlaces),
}));
export const setRelations = relations(sets, ({ many }) => ({ setPlaces: many(setPlaces) }));
export const userRelations = relations(users, ({ many }) => ({
  editions: many(editions),
  wishlists: many(wishlists),
}));
