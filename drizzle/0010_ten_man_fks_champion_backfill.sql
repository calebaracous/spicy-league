-- 1) Let users who appear in 10-man history be deleted.
--    ten_mans.created_by was NOT NULL with ON DELETE SET NULL (contradictory);
--    winner + picks FKs had no ON DELETE action and blocked user deletion.
ALTER TABLE "ten_mans" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ten_mans" DROP CONSTRAINT IF EXISTS "ten_mans_winner_captain_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_mans" ADD CONSTRAINT "ten_mans_winner_captain_user_id_user_id_fk" FOREIGN KEY ("winner_captain_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_picks" DROP CONSTRAINT IF EXISTS "ten_man_picks_captain_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_picks" ADD CONSTRAINT "ten_man_picks_captain_user_id_user_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_picks" DROP CONSTRAINT IF EXISTS "ten_man_picks_picked_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "ten_man_picks" ADD CONSTRAINT "ten_man_picks_picked_user_id_user_id_fk" FOREIGN KEY ("picked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 2) Backfill seasons.champion_team_id from each season's confirmed final.
--    confirmMatch now writes it going forward.
UPDATE "seasons" AS s
SET "champion_team_id" = m."winner_team_id"
FROM "matches" AS m
WHERE m."season_id" = s."id"
  AND m."stage" = 'final'
  AND m."state" = 'confirmed'
  AND m."winner_team_id" IS NOT NULL
  AND s."champion_team_id" IS NULL;
