ALTER TABLE "users" ADD COLUMN "discord_username" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_discord_username_unique" UNIQUE("discord_username");