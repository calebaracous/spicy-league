-- Idempotent: brings ANY database to the 0000_baseline shape. It's a no-op
-- in effect on a fresh DB built from the baseline, and on a DB that ran the
-- old 0000_init … 0010 history it:
--   * drops NOT NULL on ten_mans.created_by (its FK is ON DELETE SET NULL),
--   * re-creates 10 user FKs under Drizzle's default names with the
--     intended ON DELETE actions (the old ones used hand-written or
--     Postgres-default names, and 3 had no ON DELETE action, which blocked
--     deleting users),
--   * makes sure the ten_mans_active_uniq partial index exists,
--   * backfills seasons.champion_team_id from confirmed finals.
ALTER TABLE "ten_mans" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_user_id_fkey";--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_user_id_fkey";--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_mans" DROP CONSTRAINT IF EXISTS "ten_mans_created_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_mans" DROP CONSTRAINT IF EXISTS "ten_mans_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ten_mans" ADD CONSTRAINT "ten_mans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_mans" DROP CONSTRAINT IF EXISTS "ten_mans_winner_captain_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_mans" DROP CONSTRAINT IF EXISTS "ten_mans_winner_captain_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "ten_mans" ADD CONSTRAINT "ten_mans_winner_captain_user_id_users_id_fk" FOREIGN KEY ("winner_captain_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_signups" DROP CONSTRAINT IF EXISTS "ten_man_signups_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_signups" DROP CONSTRAINT IF EXISTS "ten_man_signups_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_signups" ADD CONSTRAINT "ten_man_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_votes" DROP CONSTRAINT IF EXISTS "ten_man_votes_voter_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_votes" DROP CONSTRAINT IF EXISTS "ten_man_votes_voter_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_votes" ADD CONSTRAINT "ten_man_votes_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_votes" DROP CONSTRAINT IF EXISTS "ten_man_votes_candidate_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_votes" DROP CONSTRAINT IF EXISTS "ten_man_votes_candidate_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_votes" ADD CONSTRAINT "ten_man_votes_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_captains" DROP CONSTRAINT IF EXISTS "ten_man_captains_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_captains" DROP CONSTRAINT IF EXISTS "ten_man_captains_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_captains" ADD CONSTRAINT "ten_man_captains_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_picks" DROP CONSTRAINT IF EXISTS "ten_man_picks_captain_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_picks" DROP CONSTRAINT IF EXISTS "ten_man_picks_captain_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_picks" ADD CONSTRAINT "ten_man_picks_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_picks" DROP CONSTRAINT IF EXISTS "ten_man_picks_picked_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_picks" DROP CONSTRAINT IF EXISTS "ten_man_picks_picked_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_picks" ADD CONSTRAINT "ten_man_picks_picked_user_id_users_id_fk" FOREIGN KEY ("picked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ten_mans_active_uniq" ON "ten_mans" ((1)) WHERE "state" NOT IN ('complete', 'cancelled');--> statement-breakpoint
UPDATE "seasons" AS s
SET "champion_team_id" = m."winner_team_id"
FROM "matches" AS m
WHERE m."season_id" = s."id"
  AND m."stage" = 'final'
  AND m."state" = 'confirmed'
  AND m."winner_team_id" IS NOT NULL
  AND s."champion_team_id" IS NULL;
