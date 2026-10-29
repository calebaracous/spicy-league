CREATE TYPE "public"."draft_kind" AS ENUM('ban', 'pick');--> statement-breakpoint
CREATE TYPE "public"."draft_side" AS ENUM('blue', 'red');--> statement-breakpoint
CREATE TYPE "public"."match_draft_state" AS ENUM('waiting', 'countdown', 'drafting', 'complete', 'skipped');--> statement-breakpoint
CREATE TABLE "match_draft_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"step" integer NOT NULL,
	"side" "draft_side" NOT NULL,
	"kind" "draft_kind" NOT NULL,
	"champion_key" text,
	"acted_by" text,
	"auto" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "match_draft_actions_game_step_uniq" UNIQUE("game_id","step")
);
--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "disabled_champions" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "draft_state" "match_draft_state" DEFAULT 'waiting' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "blue_ready_at" timestamp;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "red_ready_at" timestamp;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "draft_starts_at" timestamp;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "step_deadline" timestamp;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "blue_hover" text;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "red_hover" text;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "draft_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "match_draft_actions" ADD CONSTRAINT "match_draft_actions_game_id_match_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_draft_actions" ADD CONSTRAINT "match_draft_actions_acted_by_users_id_fk" FOREIGN KEY ("acted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Hand-written (Drizzle can't express partial indexes): a champion is banned or picked at most once per game.
CREATE UNIQUE INDEX "match_draft_actions_game_champion_uniq" ON "match_draft_actions" ("game_id", "champion_key") WHERE "champion_key" IS NOT NULL;
