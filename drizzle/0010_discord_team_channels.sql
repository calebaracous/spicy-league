ALTER TABLE "seasons" ADD COLUMN "discord_category_id" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "discord_text_channel_id" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "discord_voice_channel_id" text;