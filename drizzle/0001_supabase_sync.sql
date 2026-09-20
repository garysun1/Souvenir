CREATE TYPE "public"."ranking_status" AS ENUM('settled', 'provisional', 'unranked');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('recommend', 'depends', 'skip');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_requests" (
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"resource_id" uuid,
	"resource_path" text,
	"import_source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_requests_user_id_request_id_pk" PRIMARY KEY("user_id","request_id"),
	CONSTRAINT "api_requests_user_import_unique" UNIQUE("user_id","import_source_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "edition_counters" (
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"last_sequence" integer NOT NULL,
	CONSTRAINT "edition_counters_user_id_place_id_pk" PRIMARY KEY("user_id","place_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_preferences" (
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"tip" text DEFAULT '' NOT NULL,
	CONSTRAINT "place_preferences_user_id_place_id_pk" PRIMARY KEY("user_id","place_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ranking_groups" (
	"user_id" uuid NOT NULL,
	"category" "category" NOT NULL,
	"sentiment" "sentiment" NOT NULL,
	"place_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provisional_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "ranking_groups_user_id_category_sentiment_pk" PRIMARY KEY("user_id","category","sentiment")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wishlist_members" (
	"wishlist_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "wishlist_members_wishlist_id_user_id_pk" PRIMARY KEY("wishlist_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wishlist_saves" (
	"wishlist_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_saves_wishlist_id_place_id_user_id_pk" PRIMARY KEY("wishlist_id","place_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "editions" DROP CONSTRAINT "editions_user_place_variant_unique";--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "photo_path" text;--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "visit_sequence" integer;--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "origin" text DEFAULT 'capture' NOT NULL;--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "import_source_id" text;--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "outing_id" uuid;--> statement-breakpoint
ALTER TABLE "outings" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "outings" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "rankings" ADD COLUMN "sentiment" "sentiment";--> statement-breakpoint
ALTER TABLE "rankings" ADD COLUMN "ranking" "ranking_status" DEFAULT 'unranked' NOT NULL;--> statement-breakpoint
ALTER TABLE "rankings" ADD COLUMN "compared_to" uuid;--> statement-breakpoint
ALTER TABLE "rankings" ADD COLUMN "tied_with" uuid;--> statement-breakpoint
ALTER TABLE "wishlists" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_requests" ADD CONSTRAINT "api_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edition_counters" ADD CONSTRAINT "edition_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edition_counters" ADD CONSTRAINT "edition_counters_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_preferences" ADD CONSTRAINT "place_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_preferences" ADD CONSTRAINT "place_preferences_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ranking_groups" ADD CONSTRAINT "ranking_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlist_members" ADD CONSTRAINT "wishlist_members_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlist_members" ADD CONSTRAINT "wishlist_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlist_saves" ADD CONSTRAINT "wishlist_saves_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlist_saves" ADD CONSTRAINT "wishlist_saves_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlist_saves" ADD CONSTRAINT "wishlist_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "editions" ADD CONSTRAINT "editions_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rankings" ADD CONSTRAINT "rankings_compared_to_places_id_fk" FOREIGN KEY ("compared_to") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rankings" ADD CONSTRAINT "rankings_tied_with_places_id_fk" FOREIGN KEY ("tied_with") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wishlists_owner_default_unique" ON "wishlists" USING btree ("owner_id") WHERE "wishlists"."is_default";--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_user_request_unique" UNIQUE("user_id","request_id");--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_user_place_sequence_unique" UNIQUE("user_id","place_id","visit_sequence");--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_user_import_unique" UNIQUE("user_id","import_source_id");