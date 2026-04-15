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
ALTER TABLE "season_captains" ADD CONSTRAINT "season_captains_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_captains" ADD CONSTRAINT "season_captains_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_signups" ADD CONSTRAINT "season_signups_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_signups" ADD CONSTRAINT "season_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_captains_season_idx" ON "season_captains" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "season_signups_season_idx" ON "season_signups" USING btree ("season_id");