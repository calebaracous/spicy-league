ALTER TABLE "users" ADD COLUMN "ten_man_pings" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "discord_thread_id" text;