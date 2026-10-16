CREATE TYPE "public"."substitution_status" AS ENUM('pending', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TABLE "match_substitutions" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"team_id" text NOT NULL,
	"sub_user_id" text NOT NULL,
	"replaced_user_id" text,
	"status" "substitution_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"requested_by" text,
	"decided_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	CONSTRAINT "match_subs_match_sub_uniq" UNIQUE("match_id","sub_user_id")
);
--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_sub_user_id_users_id_fk" FOREIGN KEY ("sub_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_replaced_user_id_users_id_fk" FOREIGN KEY ("replaced_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_subs_match_idx" ON "match_substitutions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_subs_sub_user_idx" ON "match_substitutions" USING btree ("sub_user_id");