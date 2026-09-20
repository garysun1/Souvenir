CREATE TYPE "public"."activity_kind" AS ENUM('edition', 'ranking', 'note', 'set_complete', 'friend');--> statement-breakpoint
CREATE TYPE "public"."place_note_kind" AS ENUM('tip', 'warning', 'hours', 'access', 'story');--> statement-breakpoint
CREATE TYPE "public"."place_source" AS ENUM('curated', 'osm', 'wikidata', 'wikimedia', 'google', 'opentripmap', 'user', 'placeholder');--> statement-breakpoint
CREATE TYPE "public"."retention_policy" AS ENUM('metadata_only', 'do_not_store', 'expiring', 'licensed');--> statement-breakpoint
CREATE TYPE "public"."sample_status" AS ENUM('unavailable', 'insufficient', 'ready', 'stale');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'friends', 'public');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"place_id" uuid,
	"edition_id" uuid,
	"note_id" uuid,
	"ranking_place_id" uuid,
	"set_id" uuid,
	"friend_id" uuid,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_request_unique" UNIQUE("user_id","request_id","kind"),
	CONSTRAINT "activity_events_target_valid" CHECK (
    num_nonnulls("activity_events"."edition_id", "activity_events"."note_id", "activity_events"."ranking_place_id", "activity_events"."set_id", "activity_events"."friend_id") = 1 AND (
      ("activity_events"."kind" = 'edition' AND "activity_events"."edition_id" IS NOT NULL AND "activity_events"."place_id" IS NOT NULL) OR
      ("activity_events"."kind" = 'note' AND "activity_events"."note_id" IS NOT NULL AND "activity_events"."place_id" IS NOT NULL) OR
      ("activity_events"."kind" = 'ranking' AND "activity_events"."ranking_place_id" = "activity_events"."place_id" AND "activity_events"."place_id" IS NOT NULL) OR
      ("activity_events"."kind" = 'set_complete' AND "activity_events"."set_id" IS NOT NULL AND "activity_events"."place_id" IS NULL) OR
      ("activity_events"."kind" = 'friend' AND "activity_events"."friend_id" IS NOT NULL AND "activity_events"."place_id" IS NULL AND "activity_events"."friend_id" <> "activity_events"."user_id")
    ))
);
--> statement-breakpoint
ALTER TABLE "activity_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coverage_cells" (
	"geohash" text NOT NULL,
	"provider" "place_source" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"fetched_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"retry_after" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"result_count" integer,
	CONSTRAINT "coverage_cells_geohash_provider_pk" PRIMARY KEY("geohash","provider"),
	CONSTRAINT "coverage_cells_geohash_valid" CHECK ("coverage_cells"."geohash" ~ '^[0-9bcdefghjkmnpqrstuvwxyz]{5}$'),
	CONSTRAINT "coverage_cells_status_valid" CHECK ("coverage_cells"."status" IN ('pending', 'ready', 'failed')),
	CONSTRAINT "coverage_cells_count_valid" CHECK ("coverage_cells"."result_count" IS NULL OR "coverage_cells"."result_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "coverage_cells" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"source_id" uuid,
	"provider" "place_source" NOT NULL,
	"provider_id" text,
	"url" text NOT NULL,
	"width" integer,
	"height" integer,
	"license" text NOT NULL,
	"license_url" text,
	"attribution" text NOT NULL,
	"source_page_url" text NOT NULL,
	"is_hero" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"request_id" uuid,
	"storage_path" text,
	"consented_at" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_images_provider_key_unique" UNIQUE("place_id","provider","provider_id"),
	CONSTRAINT "place_images_upload_request_unique" UNIQUE("uploaded_by","request_id"),
	CONSTRAINT "place_images_dimensions_valid" CHECK (("place_images"."width" IS NULL OR "place_images"."width" > 0) AND ("place_images"."height" IS NULL OR "place_images"."height" > 0)),
	CONSTRAINT "place_images_public_copy_only" CHECK ("place_images"."storage_path" IS NULL OR "place_images"."storage_path" LIKE 'place-images/%'),
	CONSTRAINT "place_images_user_consent" CHECK ("place_images"."provider" <> 'user' OR ("place_images"."uploaded_by" IS NOT NULL AND "place_images"."consented_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "place_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" "place_note_kind" NOT NULL,
	"body" text NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"legacy_tip" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_notes_user_request_unique" UNIQUE("user_id","request_id"),
	CONSTRAINT "place_notes_body_valid" CHECK (length(btrim("place_notes"."body")) BETWEEN 1 AND 600),
	CONSTRAINT "place_notes_legacy_tip_private" CHECK (NOT "place_notes"."legacy_tip" OR ("place_notes"."visibility" = 'private' AND "place_notes"."kind" = 'tip'))
);
--> statement-breakpoint
ALTER TABLE "place_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"provider" "place_source" NOT NULL,
	"provider_id" text NOT NULL,
	"payload" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"retention_policy" "retention_policy" DEFAULT 'metadata_only' NOT NULL,
	"retained_fields" text[] DEFAULT '{}' NOT NULL,
	"policy_url" text,
	"policy_checked_at" timestamp with time zone,
	"license" text,
	"license_url" text,
	"attribution" text,
	"source_url" text,
	"status" "sample_status" DEFAULT 'unavailable' NOT NULL,
	CONSTRAINT "place_sources_provider_key_unique" UNIQUE("provider","provider_id"),
	CONSTRAINT "place_sources_retention_valid" CHECK (
    ("place_sources"."retention_policy" NOT IN ('metadata_only', 'do_not_store') OR "place_sources"."payload" IS NULL)
    AND ("place_sources"."retention_policy" <> 'expiring' OR "place_sources"."expires_at" > "place_sources"."fetched_at")
    AND ("place_sources"."retention_policy" <> 'expiring' OR "place_sources"."expires_at" IS NOT NULL)
    AND ("place_sources"."payload" IS NULL OR ("place_sources"."policy_url" IS NOT NULL AND "place_sources"."policy_checked_at" IS NOT NULL))
    AND ("place_sources"."provider" <> 'google' OR ("place_sources"."payload" IS NULL AND "place_sources"."retention_policy" IN ('metadata_only', 'do_not_store')))
  )
);
--> statement-breakpoint
ALTER TABLE "place_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_stats" (
	"place_id" uuid PRIMARY KEY NOT NULL,
	"collectors" integer DEFAULT 0 NOT NULL,
	"editions" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"recommend" integer DEFAULT 0 NOT NULL,
	"depends" integer DEFAULT 0 NOT NULL,
	"skip" integer DEFAULT 0 NOT NULL,
	"visitors_90d" integer DEFAULT 0 NOT NULL,
	"city_visitors_90d" integer DEFAULT 0 NOT NULL,
	"collectors_7d" integer DEFAULT 0 NOT NULL,
	"weekly_collectors_8w" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"collectors_8w_avg" double precision,
	"discovery_freq" double precision,
	"recommend_rate" double precision,
	"trending_score" double precision,
	"sample_status" "sample_status" DEFAULT 'unavailable' NOT NULL,
	"provenance" text DEFAULT 'souvenir-activity' NOT NULL,
	"definition_version" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"baseline_start" timestamp with time zone NOT NULL,
	"baseline_end" timestamp with time zone NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_stats_counts_valid" CHECK (
    "place_stats"."collectors" >= 0 AND "place_stats"."editions" >= 0 AND "place_stats"."saves" >= 0
    AND "place_stats"."recommend" >= 0 AND "place_stats"."depends" >= 0 AND "place_stats"."skip" >= 0
    AND "place_stats"."visitors_90d" >= 0 AND "place_stats"."city_visitors_90d" >= "place_stats"."visitors_90d"
    AND "place_stats"."collectors_7d" >= 0),
	CONSTRAINT "place_stats_rates_valid" CHECK (
    ("place_stats"."discovery_freq" IS NULL OR ("place_stats"."city_visitors_90d" >= 5 AND "place_stats"."discovery_freq" BETWEEN 0 AND 1))
    AND ("place_stats"."recommend_rate" IS NULL OR ("place_stats"."recommend" + "place_stats"."depends" + "place_stats"."skip" >= 5 AND "place_stats"."recommend_rate" BETWEEN 0 AND 1))
    AND ("place_stats"."trending_score" IS NULL OR ("place_stats"."collectors_8w_avg" IS NOT NULL AND "place_stats"."collectors_8w_avg" > 0 AND "place_stats"."trending_score" >= 0 AND "place_stats"."trending_score" < 'Infinity'::float8))),
	CONSTRAINT "place_stats_windows_valid" CHECK ("place_stats"."window_start" < "place_stats"."window_end" AND "place_stats"."baseline_start" < "place_stats"."baseline_end" AND "place_stats"."baseline_end" <= "place_stats"."window_end" - interval '7 days')
);
--> statement-breakpoint
ALTER TABLE "place_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_suggestions_user_request_unique" UNIQUE("user_id","request_id"),
	CONSTRAINT "place_suggestions_field_valid" CHECK ("place_suggestions"."field" IN ('name', 'hours', 'website', 'coords', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "place_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_tags" (
	"place_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_tags_place_id_user_id_tag_pk" PRIMARY KEY("place_id","user_id","tag"),
	CONSTRAINT "place_tags_slug_valid" CHECK ("place_tags"."tag" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("place_tags"."tag") <= 32)
);
--> statement-breakpoint
ALTER TABLE "place_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"places_visited" integer DEFAULT 0 NOT NULL,
	"editions" integer DEFAULT 0 NOT NULL,
	"cities_visited" integer DEFAULT 0 NOT NULL,
	"current_streak_weeks" integer DEFAULT 0 NOT NULL,
	"longest_streak_weeks" integer DEFAULT 0 NOT NULL,
	"global_rank" integer,
	"city_ranks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sample_status" "sample_status" DEFAULT 'unavailable' NOT NULL,
	"provenance" text DEFAULT 'souvenir-activity' NOT NULL,
	"definition_version" integer DEFAULT 1 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_stats_counts_valid" CHECK ("user_stats"."places_visited" >= 0 AND "user_stats"."editions" >= "user_stats"."places_visited" AND "user_stats"."cities_visited" >= 0 AND "user_stats"."current_streak_weeks" >= 0 AND "user_stats"."longest_streak_weeks" >= "user_stats"."current_streak_weeks" AND ("user_stats"."global_rank" IS NULL OR "user_stats"."global_rank" > 0))
);
--> statement-breakpoint
ALTER TABLE "user_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "places" ALTER COLUMN "city" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "visibility" "visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "wikidata_id" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "source" "place_source" DEFAULT 'curated' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "geohash" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "visibility" "visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "rankings" ADD COLUMN "visibility" "visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "home_country" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stats_visibility" "visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "wishlist_saves" ADD COLUMN "visibility" "visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_note_id_place_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."place_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_ranking_fk" FOREIGN KEY ("user_id","ranking_place_id") REFERENCES "public"."rankings"("user_id","place_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_images" ADD CONSTRAINT "place_images_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_images" ADD CONSTRAINT "place_images_source_id_place_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."place_sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_images" ADD CONSTRAINT "place_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_notes" ADD CONSTRAINT "place_notes_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_notes" ADD CONSTRAINT "place_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_sources" ADD CONSTRAINT "place_sources_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_stats" ADD CONSTRAINT "place_stats_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_tags" ADD CONSTRAINT "place_tags_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_tags" ADD CONSTRAINT "place_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_events_edition_unique" ON "activity_events" USING btree ("edition_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_events_note_unique" ON "activity_events" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_user_cursor_idx" ON "activity_events" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_cursor_idx" ON "activity_events" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coverage_cells_retry_idx" ON "coverage_cells" USING btree ("retry_after","lease_until");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_images_place_idx" ON "place_images" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "place_images_hero_unique" ON "place_images" USING btree ("place_id") WHERE "place_images"."is_hero";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "place_notes_legacy_tip_unique" ON "place_notes" USING btree ("user_id","place_id") WHERE "place_notes"."legacy_tip";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_notes_place_visibility_idx" ON "place_notes" USING btree ("place_id","visibility","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_sources_place_idx" ON "place_sources" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_sources_expiry_idx" ON "place_sources" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_stats_trending_idx" ON "place_stats" USING btree ("trending_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_suggestions_review_idx" ON "place_suggestions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_tags_user_idx" ON "place_tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_stats_leaderboard_idx" ON "user_stats" USING btree ("places_visited" DESC NULLS LAST,"user_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "places" ADD CONSTRAINT "places_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "editions_place_captured_user_idx" ON "editions" USING btree ("place_id","captured_at","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "editions_user_captured_idx" ON "editions" USING btree ("user_id","captured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_friend_status_idx" ON "friendships" USING btree ("friend_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_user_status_idx" ON "friendships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "places_geohash_idx" ON "places" USING btree ("geohash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "places_coordinates_idx" ON "places" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "places_locality_idx" ON "places" USING btree ("country","city","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "places_owner_idx" ON "places" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "places_wikidata_unique" ON "places" USING btree ("wikidata_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rankings_place_sentiment_idx" ON "rankings" USING btree ("place_id","sentiment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wishlist_saves_place_user_idx" ON "wishlist_saves" USING btree ("place_id","user_id");--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_owner_request_unique" UNIQUE("owner_id","request_id");--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_coordinates_valid" CHECK ("places"."lat" BETWEEN -90 AND 90 AND "places"."lng" BETWEEN -180 AND 180);--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_country_valid" CHECK ("places"."country" IS NULL OR "places"."country" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_user_owner_required" CHECK ("places"."source" <> 'user' OR "places"."owner_id" IS NOT NULL);