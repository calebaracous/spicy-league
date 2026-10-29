CREATE TYPE "public"."rps_state" AS ENUM('waiting', 'throwing', 'revealed', 'done');--> statement-breakpoint
CREATE TYPE "public"."rps_throw" AS ENUM('rock', 'paper', 'scissors');--> statement-breakpoint
CREATE TYPE "public"."side_chosen_via" AS ENUM('rps', 'loser', 'auto', 'admin');--> statement-breakpoint
CREATE TABLE "match_games" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"game_number" integer NOT NULL,
	"side_chooser_team_id" text,
	"side_deadline" timestamp,
	"side_chosen_via" "side_chosen_via",
	"side_chosen_by" text,
	"side_chosen_at" timestamp,
	"blue_team_id" text,
	"red_team_id" text,
	"tournament_code" text,
	"riot_match_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "match_games_match_game_uniq" UNIQUE("match_id","game_number")
);
--> statement-breakpoint
CREATE TABLE "match_rps" (
	"match_id" text PRIMARY KEY NOT NULL,
	"state" "rps_state" DEFAULT 'waiting' NOT NULL,
	"home_user_id" text,
	"away_user_id" text,
	"home_ready_at" timestamp,
	"away_ready_at" timestamp,
	"round" integer DEFAULT 0 NOT NULL,
	"throw_deadline" timestamp,
	"reveal_until" timestamp,
	"home_throw" "rps_throw",
	"away_throw" "rps_throw",
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"winner_team_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stats_opt_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_side_chooser_team_id_teams_id_fk" FOREIGN KEY ("side_chooser_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_side_chosen_by_users_id_fk" FOREIGN KEY ("side_chosen_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_blue_team_id_teams_id_fk" FOREIGN KEY ("blue_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_red_team_id_teams_id_fk" FOREIGN KEY ("red_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rps" ADD CONSTRAINT "match_rps_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rps" ADD CONSTRAINT "match_rps_home_user_id_users_id_fk" FOREIGN KEY ("home_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rps" ADD CONSTRAINT "match_rps_away_user_id_users_id_fk" FOREIGN KEY ("away_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rps" ADD CONSTRAINT "match_rps_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_games_match_idx" ON "match_games" USING btree ("match_id");