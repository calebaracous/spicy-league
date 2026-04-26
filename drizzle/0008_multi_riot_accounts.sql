-- Multi-Riot-account support: a user can link up to 3 Riot accounts (limit
-- enforced in app code). Snapshots are now keyed by account_link_id so each
-- linked account has its own rank rows.

-- Replace the (user_id, provider) unique with (user_id, provider, external_id)
-- so multiple riot links per user are allowed but the same Riot ID can't be
-- linked twice.
ALTER TABLE "account_links" DROP CONSTRAINT "account_links_user_provider_uniq";--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_user_provider_external_uniq" UNIQUE("user_id","provider","external_id");--> statement-breakpoint

-- Wipe existing riot snapshots — the cron will repopulate them with the new
-- account_link_id column on its next run.
DELETE FROM "riot_stat_snapshots";--> statement-breakpoint

ALTER TABLE "riot_stat_snapshots" ADD COLUMN "account_link_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "riot_stat_snapshots" ADD CONSTRAINT "riot_stat_snapshots_account_link_id_account_links_id_fk" FOREIGN KEY ("account_link_id") REFERENCES "public"."account_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "riot_snapshots_link_idx" ON "riot_stat_snapshots" USING btree ("account_link_id");
