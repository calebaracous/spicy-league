ALTER TABLE "users" RENAME COLUMN "display_name" TO "username";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "users_display_name_unique" TO "users_username_unique";
