-- 10-man pickup match feature: five new tables + partial unique index.

CREATE TYPE "public"."ten_man_state" AS ENUM('signups', 'voting', 'drafting', 'ready', 'complete', 'cancelled');--> statement-breakpoint

CREATE TABLE "ten_mans" (
  "id" text PRIMARY KEY NOT NULL,
  "state" "ten_man_state" DEFAULT 'signups' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "signups_closed_at" timestamp,
  "draft_started_at" timestamp,
  "ready_at" timestamp,
  "completed_at" timestamp,
  "lobby_code" text,
  "winner_captain_user_id" text,
  "duration_label" text
);--> statement-breakpoint

CREATE TABLE "ten_man_signups" (
  "id" text PRIMARY KEY NOT NULL,
  "ten_man_id" text NOT NULL,
  "user_id" text NOT NULL,
  "signup_order" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ten_man_signups_uniq" UNIQUE("ten_man_id","user_id"),
  CONSTRAINT "ten_man_signups_order_uniq" UNIQUE("ten_man_id","signup_order")
);--> statement-breakpoint

CREATE TABLE "ten_man_votes" (
  "id" text PRIMARY KEY NOT NULL,
  "ten_man_id" text NOT NULL,
  "voter_user_id" text NOT NULL,
  "candidate_user_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ten_man_votes_uniq" UNIQUE("ten_man_id","voter_user_id","candidate_user_id")
);--> statement-breakpoint

CREATE TABLE "ten_man_captains" (
  "id" text PRIMARY KEY NOT NULL,
  "ten_man_id" text NOT NULL,
  "user_id" text NOT NULL,
  "captain_order" integer NOT NULL,
  "vote_count" integer NOT NULL,
  CONSTRAINT "ten_man_captains_uniq" UNIQUE("ten_man_id","user_id"),
  CONSTRAINT "ten_man_captains_order_uniq" UNIQUE("ten_man_id","captain_order")
);--> statement-breakpoint

CREATE TABLE "ten_man_picks" (
  "id" text PRIMARY KEY NOT NULL,
  "ten_man_id" text NOT NULL,
  "pick_number" integer NOT NULL,
  "captain_user_id" text NOT NULL,
  "picked_user_id" text NOT NULL,
  "picked_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ten_man_picks_num_uniq" UNIQUE("ten_man_id","pick_number"),
  CONSTRAINT "ten_man_picks_user_uniq" UNIQUE("ten_man_id","picked_user_id")
);--> statement-breakpoint

ALTER TABLE "ten_mans" ADD CONSTRAINT "ten_mans_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_mans" ADD CONSTRAINT "ten_mans_winner_captain_user_id_user_id_fk" FOREIGN KEY ("winner_captain_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ten_man_signups" ADD CONSTRAINT "ten_man_signups_ten_man_id_ten_mans_id_fk" FOREIGN KEY ("ten_man_id") REFERENCES "public"."ten_mans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_signups" ADD CONSTRAINT "ten_man_signups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ten_man_votes" ADD CONSTRAINT "ten_man_votes_ten_man_id_ten_mans_id_fk" FOREIGN KEY ("ten_man_id") REFERENCES "public"."ten_mans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_votes" ADD CONSTRAINT "ten_man_votes_voter_user_id_user_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_votes" ADD CONSTRAINT "ten_man_votes_candidate_user_id_user_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ten_man_captains" ADD CONSTRAINT "ten_man_captains_ten_man_id_ten_mans_id_fk" FOREIGN KEY ("ten_man_id") REFERENCES "public"."ten_mans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_captains" ADD CONSTRAINT "ten_man_captains_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ten_man_picks" ADD CONSTRAINT "ten_man_picks_ten_man_id_ten_mans_id_fk" FOREIGN KEY ("ten_man_id") REFERENCES "public"."ten_mans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_picks" ADD CONSTRAINT "ten_man_picks_captain_user_id_user_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ten_man_picks" ADD CONSTRAINT "ten_man_picks_picked_user_id_user_id_fk" FOREIGN KEY ("picked_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "ten_man_signups_ten_idx" ON "ten_man_signups" USING btree ("ten_man_id");--> statement-breakpoint
CREATE INDEX "ten_man_votes_ten_idx" ON "ten_man_votes" USING btree ("ten_man_id");--> statement-breakpoint

-- Partial unique index: only one active 10-man at a time.
-- Drizzle's DSL can't express this shape, so it's hand-written here.
CREATE UNIQUE INDEX "ten_mans_active_uniq" ON "ten_mans" ((1)) WHERE state NOT IN ('complete', 'cancelled');
