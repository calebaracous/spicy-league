CREATE TYPE "public"."lane_role" AS ENUM('top', 'jungle', 'mid', 'bot', 'support');--> statement-breakpoint
ALTER TABLE "match_draft_actions" ADD COLUMN "role" "lane_role";