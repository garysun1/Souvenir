ALTER TABLE "editions" ALTER COLUMN "request_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "editions" ALTER COLUMN "visit_sequence" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rankings" ALTER COLUMN "sentiment" SET NOT NULL;