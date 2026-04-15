CREATE TYPE "public"."game" AS ENUM('lol', 'cs2');--> statement-breakpoint
CREATE TYPE "public"."season_state" AS ENUM('draft', 'signups_open', 'signups_closed', 'captains_selected', 'drafting', 'group_stage', 'playoffs', 'complete');--> statement-breakpoint
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
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seasons_state_idx" ON "seasons" USING btree ("state");