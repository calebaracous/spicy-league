CREATE TYPE "public"."signup_kind" AS ENUM('player', 'sub');--> statement-breakpoint
ALTER TABLE "season_signups" ADD COLUMN "kind" "signup_kind" DEFAULT 'player' NOT NULL;