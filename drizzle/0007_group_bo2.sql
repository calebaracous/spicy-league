ALTER TYPE "public"."match_stage" ADD VALUE 'tiebreaker' BEFORE 'semis';--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "group_best_of" integer DEFAULT 1 NOT NULL;