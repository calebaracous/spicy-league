CREATE TYPE "public"."match_stage" AS ENUM('group', 'semis', 'final');--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "stage" "match_stage" DEFAULT 'group' NOT NULL;