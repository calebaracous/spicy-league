ALTER TABLE "seasons" ADD COLUMN "playoff_best_of" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "final_best_of" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "winner_team_id" text;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "result_reported_by" text;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "result_reported_at" timestamp;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "result_flagged_by" text;--> statement-breakpoint
ALTER TABLE "match_games" ADD COLUMN "result_flagged_at" timestamp;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_result_reported_by_users_id_fk" FOREIGN KEY ("result_reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_result_flagged_by_users_id_fk" FOREIGN KEY ("result_flagged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;