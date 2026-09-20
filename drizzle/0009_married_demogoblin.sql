CREATE TYPE "public"."import_batch_state" AS ENUM('open', 'processing', 'ready', 'committed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."import_item_state" AS ENUM('pending_upload', 'uploaded', 'processing', 'ready', 'failed', 'duplicate', 'committed');--> statement-breakpoint
CREATE TYPE "public"."memory_invitation_state" AS ENUM('pending', 'accepted', 'declined', 'removed');--> statement-breakpoint
CREATE TYPE "public"."taste_analysis_state" AS ENUM('idle', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."taste_intent" AS ENUM('enjoyed', 'want_to_try');--> statement-breakpoint
CREATE TYPE "public"."taste_interest" AS ENUM('gardens', 'architecture', 'museums', 'street_food', 'waterfronts', 'hiking', 'beaches', 'parks', 'art', 'history', 'cafes', 'markets', 'live_music', 'theater', 'local_food', 'photography', 'scenic_views', 'wildlife', 'cycling', 'bookshops');--> statement-breakpoint
CREATE TYPE "public"."taste_sharing" AS ENUM('private', 'friends');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"title" text NOT NULL,
	"state" "import_batch_state" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "import_batches_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "import_batches_id_owner_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "import_batches_title_valid" CHECK (char_length("import_batches"."title") BETWEEN 1 AND 120),
	CONSTRAINT "import_batches_version_valid" CHECK ("import_batches"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "import_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"photo_path" text,
	"state" "import_item_state" DEFAULT 'pending_upload' NOT NULL,
	"metadata" jsonb NOT NULL,
	"analysis" jsonb,
	"group_key" text,
	"confirmed_stop" jsonb,
	"duplicate_of_item_id" uuid,
	"edition_id" uuid,
	"error" jsonb,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "import_items_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "import_items_id_owner_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "import_items_hash_valid" CHECK ("import_items"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "import_items_file_valid" CHECK (char_length("import_items"."file_name") BETWEEN 1 AND 255 AND "import_items"."size_bytes" BETWEEN 1 AND 10485760 AND "import_items"."content_type" IN ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "import_items_path_valid" CHECK ("import_items"."photo_path" IS NULL OR ("import_items"."photo_path" LIKE "import_items"."owner_id"::text || '/%' AND char_length("import_items"."photo_path") <= 512)),
	CONSTRAINT "import_items_group_valid" CHECK ("import_items"."group_key" IS NULL OR char_length("import_items"."group_key") BETWEEN 1 AND 80),
	CONSTRAINT "import_items_duplicate_valid" CHECK (("import_items"."state" = 'duplicate') = ("import_items"."duplicate_of_item_id" IS NOT NULL) AND ("import_items"."duplicate_of_item_id" IS NULL OR "import_items"."duplicate_of_item_id" <> "import_items"."id")),
	CONSTRAINT "import_items_version_valid" CHECK ("import_items"."version" > 0 AND "import_items"."attempts" BETWEEN 0 AND 3),
	CONSTRAINT "import_items_lease_valid" CHECK (("import_items"."lease_token" IS NULL) = ("import_items"."lease_expires_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "import_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"album_id" uuid,
	"source_edition_id" uuid,
	"source_import_item_id" uuid,
	"place_id" uuid,
	"captured_at" timestamp with time zone,
	"timezone" text,
	"group_key" text,
	"note" text,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "memory_moments_author_request_unique" UNIQUE("author_id","request_id"),
	CONSTRAINT "memory_moments_id_author_unique" UNIQUE("id","author_id"),
	CONSTRAINT "memory_moments_source_valid" CHECK (num_nonnulls("memory_moments"."source_edition_id", "memory_moments"."source_import_item_id") = 1 AND ("memory_moments"."source_edition_id" IS NULL OR "memory_moments"."place_id" IS NOT NULL)),
	CONSTRAINT "memory_moments_stop_valid" CHECK (num_nonnulls("memory_moments"."place_id", "memory_moments"."captured_at", "memory_moments"."timezone") IN (0, 3)),
	CONSTRAINT "memory_moments_text_valid" CHECK (("memory_moments"."note" IS NULL OR char_length("memory_moments"."note") <= 2000) AND ("memory_moments"."group_key" IS NULL OR char_length("memory_moments"."group_key") BETWEEN 1 AND 80) AND ("memory_moments"."timezone" IS NULL OR char_length("memory_moments"."timezone") BETWEEN 1 AND 100)),
	CONSTRAINT "memory_moments_version_valid" CHECK ("memory_moments"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "memory_moments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moment_person_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moment_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"state" "memory_invitation_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "moment_person_tags_moment_user_unique" UNIQUE("moment_id","user_id"),
	CONSTRAINT "moment_person_tags_sender_request_unique" UNIQUE("sender_id","request_id"),
	CONSTRAINT "moment_person_tags_other_user" CHECK ("moment_person_tags"."sender_id" <> "moment_person_tags"."user_id"),
	CONSTRAINT "moment_person_tags_version_valid" CHECK ("moment_person_tags"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "moment_person_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taste_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"interest" "taste_interest" NOT NULL,
	"intent" "taste_intent" NOT NULL,
	"confidence" real NOT NULL,
	"explanation" text NOT NULL,
	"analysis_version" integer NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "taste_evidence_source_interest_unique" UNIQUE("user_id","source_kind","source_id","interest","intent"),
	CONSTRAINT "taste_evidence_source_valid" CHECK ("taste_evidence"."source_kind" IN ('edition', 'import_item', 'saved_place', 'favorite', 'recommendation')),
	CONSTRAINT "taste_evidence_confidence_valid" CHECK ("taste_evidence"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "taste_evidence_explanation_valid" CHECK (char_length("taste_evidence"."explanation") BETWEEN 1 AND 500),
	CONSTRAINT "taste_evidence_version_valid" CHECK ("taste_evidence"."version" > 0 AND "taste_evidence"."analysis_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "taste_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taste_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"draft" jsonb,
	"published" jsonb,
	"sharing" "taste_sharing" DEFAULT 'private' NOT NULL,
	"title_override" text,
	"overrides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferences" jsonb DEFAULT '{"pace":null,"budget":null,"accessibility":null}'::jsonb NOT NULL,
	"selected_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"collage_moment_ids" uuid[] DEFAULT '{}' NOT NULL,
	"analysis_state" "taste_analysis_state" DEFAULT 'idle' NOT NULL,
	"analysis_version" integer DEFAULT 1 NOT NULL,
	"analysis_request_id" uuid,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "taste_profiles_version_valid" CHECK ("taste_profiles"."version" > 0 AND "taste_profiles"."analysis_version" > 0),
	CONSTRAINT "taste_profiles_title_valid" CHECK ("taste_profiles"."title_override" IS NULL OR char_length("taste_profiles"."title_override") BETWEEN 1 AND 120),
	CONSTRAINT "taste_profiles_collage_bounded" CHECK (cardinality("taste_profiles"."collage_moment_ids") <= 6),
	CONSTRAINT "taste_profiles_sources_bounded" CHECK (jsonb_typeof("taste_profiles"."selected_sources") = 'array' AND jsonb_array_length("taste_profiles"."selected_sources") <= 100 AND jsonb_typeof("taste_profiles"."excluded_sources") = 'array' AND jsonb_array_length("taste_profiles"."excluded_sources") <= 100),
	CONSTRAINT "taste_profiles_overrides_bounded" CHECK (jsonb_typeof("taste_profiles"."overrides") = 'array' AND jsonb_array_length("taste_profiles"."overrides") <= 20),
	CONSTRAINT "taste_profiles_published_required" CHECK ("taste_profiles"."sharing" = 'private' OR "taste_profiles"."published" IS NOT NULL),
	CONSTRAINT "taste_profiles_lease_valid" CHECK (("taste_profiles"."lease_token" IS NULL) = ("taste_profiles"."lease_expires_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "taste_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trip_album_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"role" text DEFAULT 'contributor' NOT NULL,
	"state" "memory_invitation_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "trip_album_members_album_user_unique" UNIQUE("album_id","user_id"),
	CONSTRAINT "trip_album_members_inviter_request_unique" UNIQUE("invited_by","request_id"),
	CONSTRAINT "trip_album_members_role_valid" CHECK ("trip_album_members"."role" = 'contributor' AND "trip_album_members"."user_id" <> "trip_album_members"."invited_by"),
	CONSTRAINT "trip_album_members_version_valid" CHECK ("trip_album_members"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "trip_album_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trip_albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"outing_id" uuid,
	"source_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "trip_albums_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "trip_albums_text_valid" CHECK (char_length("trip_albums"."title") BETWEEN 1 AND 120 AND ("trip_albums"."description" IS NULL OR char_length("trip_albums"."description") <= 2000)),
	CONSTRAINT "trip_albums_version_valid" CHECK ("trip_albums"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "trip_albums" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_items" ADD CONSTRAINT "import_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_items" ADD CONSTRAINT "import_items_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_items" ADD CONSTRAINT "import_items_batch_owner_fk" FOREIGN KEY ("batch_id","owner_id") REFERENCES "public"."import_batches"("id","owner_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_items" ADD CONSTRAINT "import_items_duplicate_owner_fk" FOREIGN KEY ("duplicate_of_item_id","owner_id") REFERENCES "public"."import_items"("id","owner_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memory_moments" ADD CONSTRAINT "memory_moments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memory_moments" ADD CONSTRAINT "memory_moments_album_id_trip_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."trip_albums"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memory_moments" ADD CONSTRAINT "memory_moments_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memory_moments" ADD CONSTRAINT "memory_moments_edition_owner_fk" FOREIGN KEY ("source_edition_id","author_id","place_id") REFERENCES "public"."editions"("id","user_id","place_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memory_moments" ADD CONSTRAINT "memory_moments_import_owner_fk" FOREIGN KEY ("source_import_item_id","author_id") REFERENCES "public"."import_items"("id","owner_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "moment_person_tags" ADD CONSTRAINT "moment_person_tags_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "moment_person_tags" ADD CONSTRAINT "moment_person_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "moment_person_tags" ADD CONSTRAINT "moment_person_tags_author_fk" FOREIGN KEY ("moment_id","sender_id") REFERENCES "public"."memory_moments"("id","author_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taste_evidence" ADD CONSTRAINT "taste_evidence_user_id_taste_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."taste_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taste_profiles" ADD CONSTRAINT "taste_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_album_members" ADD CONSTRAINT "trip_album_members_album_id_trip_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."trip_albums"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_album_members" ADD CONSTRAINT "trip_album_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_album_members" ADD CONSTRAINT "trip_album_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_albums" ADD CONSTRAINT "trip_albums_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_albums" ADD CONSTRAINT "trip_albums_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_albums" ADD CONSTRAINT "trip_albums_source_batch_id_import_batches_id_fk" FOREIGN KEY ("source_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_batches_owner_cursor_idx" ON "import_batches" USING btree ("owner_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "import_items_owner_hash_unique" ON "import_items" USING btree ("owner_id","sha256") WHERE "import_items"."state" <> 'duplicate';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_items_batch_idx" ON "import_items" USING btree ("batch_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_items_owner_idx" ON "import_items" USING btree ("owner_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memory_moments_import_item_unique" ON "memory_moments" USING btree ("source_import_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_moments_author_cursor_idx" ON "memory_moments" USING btree ("author_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_moments_album_cursor_idx" ON "memory_moments" USING btree ("album_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moment_person_tags_recipient_state_idx" ON "moment_person_tags" USING btree ("user_id","state","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "taste_evidence_owner_source_idx" ON "taste_evidence" USING btree ("user_id","source_kind","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trip_album_members_user_state_idx" ON "trip_album_members" USING btree ("user_id","state","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trip_albums_owner_cursor_idx" ON "trip_albums" USING btree ("owner_id","id");