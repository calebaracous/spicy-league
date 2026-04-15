CREATE TYPE "public"."account_provider" AS ENUM('riot', 'steam', 'leetify');--> statement-breakpoint
CREATE TABLE "account_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "account_provider" NOT NULL,
	"external_id" text NOT NULL,
	"external_handle" text,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_links_user_provider_uniq" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "leetify_stat_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rating" numeric,
	"winrate" numeric,
	"avg_kd" numeric,
	"avg_adr" numeric,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "riot_stat_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"queue" text NOT NULL,
	"tier" text,
	"rank_division" text,
	"lp" integer,
	"wins" integer,
	"losses" integer,
	"top_champs" jsonb,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leetify_stat_snapshots" ADD CONSTRAINT "leetify_stat_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot_stat_snapshots" ADD CONSTRAINT "riot_stat_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_links_user_idx" ON "account_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leetify_snapshots_user_idx" ON "leetify_stat_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "riot_snapshots_user_idx" ON "riot_stat_snapshots" USING btree ("user_id");