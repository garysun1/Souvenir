ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_target_valid";--> statement-breakpoint
ALTER TABLE "place_stats" DROP CONSTRAINT "place_stats_rates_valid";--> statement-breakpoint
ALTER TABLE "place_stats" DROP CONSTRAINT "place_stats_windows_valid";--> statement-breakpoint
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_edition_id_editions_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_note_id_place_notes_id_fk";
--> statement-breakpoint
ALTER TABLE "place_stats" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "place_stats" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_event_identity_unique" UNIQUE("id","user_id","place_id");--> statement-breakpoint
ALTER TABLE "place_notes" ADD CONSTRAINT "place_notes_event_identity_unique" UNIQUE("id","user_id","place_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_edition_owner_fk" FOREIGN KEY ("edition_id","user_id","place_id") REFERENCES "public"."editions"("id","user_id","place_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_note_owner_fk" FOREIGN KEY ("note_id","user_id","place_id") REFERENCES "public"."place_notes"("id","user_id","place_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_target_valid" CHECK (
    (num_nonnulls("activity_events"."edition_id", "activity_events"."note_id", "activity_events"."ranking_place_id", "activity_events"."set_id", "activity_events"."friend_id") = 1 AND (
      ("activity_events"."kind" = 'edition' AND "activity_events"."edition_id" IS NOT NULL AND "activity_events"."place_id" IS NOT NULL) OR
      ("activity_events"."kind" = 'note' AND "activity_events"."note_id" IS NOT NULL AND "activity_events"."place_id" IS NOT NULL) OR
      ("activity_events"."kind" = 'ranking' AND "activity_events"."ranking_place_id" = "activity_events"."place_id" AND "activity_events"."place_id" IS NOT NULL) OR
      ("activity_events"."kind" = 'set_complete' AND "activity_events"."set_id" IS NOT NULL AND "activity_events"."place_id" IS NULL) OR
      ("activity_events"."kind" = 'friend' AND "activity_events"."friend_id" IS NOT NULL AND "activity_events"."place_id" IS NULL AND "activity_events"."friend_id" <> "activity_events"."user_id")
    )) IS TRUE);--> statement-breakpoint
ALTER TABLE "place_stats" ADD CONSTRAINT "place_stats_rates_valid" CHECK (
    ("place_stats"."discovery_freq" IS NULL OR ("place_stats"."city" IS NOT NULL AND "place_stats"."country" IS NOT NULL AND "place_stats"."city_visitors_90d" >= 5 AND "place_stats"."discovery_freq" BETWEEN 0 AND 1 AND abs("place_stats"."discovery_freq" - "place_stats"."visitors_90d"::float8 / nullif("place_stats"."city_visitors_90d", 0)) < 1e-9))
    AND ("place_stats"."recommend_rate" IS NULL OR ("place_stats"."recommend" + "place_stats"."depends" + "place_stats"."skip" >= 5 AND "place_stats"."recommend_rate" BETWEEN 0 AND 1 AND abs("place_stats"."recommend_rate" - "place_stats"."recommend"::float8 / nullif("place_stats"."recommend" + "place_stats"."depends" + "place_stats"."skip", 0)) < 1e-9))
    AND ("place_stats"."trending_score" IS NULL OR ("place_stats"."collectors_8w_avg" IS NOT NULL AND "place_stats"."collectors_8w_avg" > 0 AND "place_stats"."trending_score" >= 0 AND "place_stats"."trending_score" < 'Infinity'::float8)));--> statement-breakpoint
ALTER TABLE "place_stats" ADD CONSTRAINT "place_stats_windows_valid" CHECK ("place_stats"."window_end" - "place_stats"."window_start" = interval '90 days' AND "place_stats"."baseline_end" - "place_stats"."baseline_start" = interval '56 days' AND "place_stats"."baseline_end" <= "place_stats"."window_end" - interval '7 days' AND "place_stats"."baseline_end" > "place_stats"."window_end" - interval '14 days' AND date_trunc('week', "place_stats"."baseline_end" AT TIME ZONE 'UTC') = "place_stats"."baseline_end" AT TIME ZONE 'UTC');