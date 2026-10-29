CREATE TABLE "match_game_player_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"puuid" text NOT NULL,
	"user_id" text,
	"side" "draft_side" NOT NULL,
	"champion_key" text NOT NULL,
	"kills" integer NOT NULL,
	"deaths" integer NOT NULL,
	"assists" integer NOT NULL,
	"cs" integer NOT NULL,
	"gold" integer NOT NULL,
	"damage" integer NOT NULL,
	"vision_score" integer NOT NULL,
	"win" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "match_game_player_stats_game_puuid_uniq" UNIQUE("game_id","puuid")
);
--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "riot_tournament_id" integer;--> statement-breakpoint
ALTER TABLE "match_game_player_stats" ADD CONSTRAINT "match_game_player_stats_game_id_match_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_game_player_stats" ADD CONSTRAINT "match_game_player_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;