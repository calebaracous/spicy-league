-- Baseline: the full schema as of the squash, generated from src/db/schema
-- with `drizzle-kit generate` against an empty history, plus the one object
-- Drizzle's DSL can't express (ten_mans_active_uniq, at the bottom).
--
-- Replaces the old 0000_init … 0010 history, which could not build a working
-- DB from scratch (it never migrated the Auth.js tables to Better Auth's).
-- Its journal `when` sorts below the old 0007 row, so databases that ran the
-- old history skip it and only get 0001_reconcile_live_schema.
-- See docs/DATA-MODEL.md → "Migrations".
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."game" AS ENUM('lol', 'cs2');--> statement-breakpoint
CREATE TYPE "public"."season_state" AS ENUM('draft', 'signups_open', 'signups_closed', 'captains_selected', 'drafting', 'group_stage', 'playoffs', 'complete');--> statement-breakpoint
CREATE TYPE "public"."account_provider" AS ENUM('riot', 'steam', 'leetify');--> statement-breakpoint
CREATE TYPE "public"."draft_state" AS ENUM('pending', 'in_progress', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."match_stage" AS ENUM('group', 'semis', 'final');--> statement-breakpoint
CREATE TYPE "public"."match_state" AS ENUM('scheduled', 'reported', 'confirmed', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."ten_man_state" AS ENUM('signups', 'voting', 'drafting', 'ready', 'complete', 'cancelled');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"bio" text,
	"pronouns" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"opgg_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "season_captains" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"user_id" text NOT NULL,
	"captain_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "season_captains_season_user_uniq" UNIQUE("season_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "season_signups" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_prefs" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "season_signups_season_user_uniq" UNIQUE("season_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"game" "game" NOT NULL,
	"state" "season_state" DEFAULT 'draft' NOT NULL,
	"description" text,
	"rules" text,
	"signup_opens_at" timestamp,
	"signup_closes_at" timestamp,
	"season_start_at" timestamp,
	"champion_team_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_name_unique" UNIQUE("name"),
	CONSTRAINT "seasons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "account_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "account_provider" NOT NULL,
	"external_id" text NOT NULL,
	"external_handle" text,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_links_user_provider_external_uniq" UNIQUE("user_id","provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "leetify_stat_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rating" numeric,
	"winrate" numeric,
	"avg_kd" numeric,
	"avg_adr" numeric,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "riot_stat_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_link_id" text NOT NULL,
	"queue" text NOT NULL,
	"tier" text,
	"rank_division" text,
	"lp" integer,
	"wins" integer,
	"losses" integer,
	"top_champs" jsonb,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_picks" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"pick_number" integer NOT NULL,
	"captain_user_id" text NOT NULL,
	"picked_user_id" text NOT NULL,
	"picked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "draft_picks_draft_pick_uniq" UNIQUE("draft_id","pick_number"),
	CONSTRAINT "draft_picks_draft_picked_uniq" UNIQUE("draft_id","picked_user_id")
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"state" "draft_state" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_season_id_unique" UNIQUE("season_id")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"pick_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_user_uniq" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"name" text NOT NULL,
	"captain_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_season_captain_uniq" UNIQUE("season_id","captain_user_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"round" integer NOT NULL,
	"stage" "match_stage" DEFAULT 'group' NOT NULL,
	"home_team_id" text NOT NULL,
	"away_team_id" text NOT NULL,
	"scheduled_at" timestamp,
	"state" "match_state" DEFAULT 'scheduled' NOT NULL,
	"winner_team_id" text,
	"home_score" integer,
	"away_score" integer,
	"reported_by" text,
	"reported_at" timestamp,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ten_man_captains" (
	"id" text PRIMARY KEY NOT NULL,
	"ten_man_id" text NOT NULL,
	"user_id" text NOT NULL,
	"captain_order" integer NOT NULL,
	"vote_count" integer NOT NULL,
	CONSTRAINT "ten_man_captains_uniq" UNIQUE("ten_man_id","user_id"),
	CONSTRAINT "ten_man_captains_order_uniq" UNIQUE("ten_man_id","captain_order")
);
--> statement-breakpoint
CREATE TABLE "ten_man_picks" (
	"id" text PRIMARY KEY NOT NULL,
	"ten_man_id" text NOT NULL,
	"pick_number" integer NOT NULL,
	"captain_user_id" text NOT NULL,
	"picked_user_id" text NOT NULL,
	"picked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ten_man_picks_num_uniq" UNIQUE("ten_man_id","pick_number"),
	CONSTRAINT "ten_man_picks_user_uniq" UNIQUE("ten_man_id","picked_user_id")
);
--> statement-breakpoint
CREATE TABLE "ten_man_signups" (
	"id" text PRIMARY KEY NOT NULL,
	"ten_man_id" text NOT NULL,
	"user_id" text NOT NULL,
	"signup_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ten_man_signups_uniq" UNIQUE("ten_man_id","user_id"),
	CONSTRAINT "ten_man_signups_order_uniq" UNIQUE("ten_man_id","signup_order")
);
--> statement-breakpoint
CREATE TABLE "ten_man_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"ten_man_id" text NOT NULL,
	"voter_user_id" text NOT NULL,
	"candidate_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ten_man_votes_uniq" UNIQUE("ten_man_id","voter_user_id","candidate_user_id")
);
--> statement-breakpoint
CREATE TABLE "ten_mans" (
	"id" text PRIMARY KEY NOT NULL,
	"state" "ten_man_state" DEFAULT 'signups' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"signups_closed_at" timestamp,
	"draft_started_at" timestamp,
	"ready_at" timestamp,
	"completed_at" timestamp,
	"lobby_code" text,
	"winner_captain_user_id" text,
	"duration_label" text
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_captains" ADD CONSTRAINT "season_captains_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_captains" ADD CONSTRAINT "season_captains_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_signups" ADD CONSTRAINT "season_signups_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_signups" ADD CONSTRAINT "season_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leetify_stat_snapshots" ADD CONSTRAINT "leetify_stat_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot_stat_snapshots" ADD CONSTRAINT "riot_stat_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot_stat_snapshots" ADD CONSTRAINT "riot_stat_snapshots_account_link_id_account_links_id_fk" FOREIGN KEY ("account_link_id") REFERENCES "public"."account_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_picked_user_id_users_id_fk" FOREIGN KEY ("picked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_captains" ADD CONSTRAINT "ten_man_captains_ten_man_id_ten_mans_id_fk" FOREIGN KEY ("ten_man_id") REFERENCES "public"."ten_mans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_captains" ADD CONSTRAINT "ten_man_captains_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_picks" ADD CONSTRAINT "ten_man_picks_ten_man_id_ten_mans_id_fk" FOREIGN KEY ("ten_man_id") REFERENCES "public"."ten_mans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_picks" ADD CONSTRAINT "ten_man_picks_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_picks" ADD CONSTRAINT "ten_man_picks_picked_user_id_users_id_fk" FOREIGN KEY ("picked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_signups" ADD CONSTRAINT "ten_man_signups_ten_man_id_ten_mans_id_fk" FOREIGN KEY ("ten_man_id") REFERENCES "public"."ten_mans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_signups" ADD CONSTRAINT "ten_man_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_votes" ADD CONSTRAINT "ten_man_votes_ten_man_id_ten_mans_id_fk" FOREIGN KEY ("ten_man_id") REFERENCES "public"."ten_mans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_votes" ADD CONSTRAINT "ten_man_votes_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_votes" ADD CONSTRAINT "ten_man_votes_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_mans" ADD CONSTRAINT "ten_mans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_mans" ADD CONSTRAINT "ten_mans_winner_captain_user_id_users_id_fk" FOREIGN KEY ("winner_captain_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_captains_season_idx" ON "season_captains" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "season_signups_season_idx" ON "season_signups" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "seasons_state_idx" ON "seasons" USING btree ("state");--> statement-breakpoint
CREATE INDEX "account_links_user_idx" ON "account_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leetify_snapshots_user_idx" ON "leetify_stat_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "riot_snapshots_user_idx" ON "riot_stat_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "riot_snapshots_link_idx" ON "riot_stat_snapshots" USING btree ("account_link_id");--> statement-breakpoint
CREATE INDEX "draft_picks_draft_idx" ON "draft_picks" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "team_members_team_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teams_season_idx" ON "teams" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "matches_season_idx" ON "matches" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "matches_home_idx" ON "matches" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "matches_away_idx" ON "matches" USING btree ("away_team_id");--> statement-breakpoint
CREATE INDEX "ten_man_signups_ten_idx" ON "ten_man_signups" USING btree ("ten_man_id");--> statement-breakpoint
CREATE INDEX "ten_man_votes_ten_idx" ON "ten_man_votes" USING btree ("ten_man_id");
--> statement-breakpoint
-- Only one active 10-man at a time. Hand-written: Drizzle can't express an
-- expression index with a WHERE clause, so it is NOT in the snapshot and
-- `db:generate` will never try to drop it.
CREATE UNIQUE INDEX "ten_mans_active_uniq" ON "ten_mans" ((1)) WHERE "state" NOT IN ('complete', 'cancelled');
