import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_URL: z.url().optional(),
    AUTH_RESEND_KEY: z.string().min(1).optional(),
    AUTH_EMAIL_FROM: z.email().optional(),
    RIOT_DEVELOPER_API_KEY: z.string().min(1).optional(),
    RIOT_PERSONAL_API_KEY: z.string().min(1).optional(),
    // Riot Tournament API (docs/MATCH-DAY.md, phase 6). A tournament-enabled
    // key; without it the personal key is used against tournament-stub-v5.
    RIOT_TOURNAMENT_API_KEY: z.string().min(1).optional(),
    // Provider id from scripts/riot-tournament-setup.mjs. Unset = no lobby codes.
    RIOT_TOURNAMENT_PROVIDER_ID: z.coerce.number().int().positive().optional(),
    // Shared secret in the callback URL Riot posts game results to.
    RIOT_TOURNAMENT_CALLBACK_SECRET: z.string().min(16).optional(),
    CRON_SECRET: z.string().min(1).optional(),
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    DISCORD_BOT_TOKEN: z.string().min(1).optional(),
    DISCORD_GUILD_ID: z.string().regex(/^\d+$/).optional(),
    DISCORD_CAPTAIN_ROLE_ID: z.string().regex(/^\d+$/).optional(),
    DISCORD_MATCHES_CHANNEL_ID: z.string().regex(/^\d+$/).optional(),
    DISCORD_TEN_MAN_CHANNEL_ID: z.string().regex(/^\d+$/).optional(),
    DISCORD_ANNOUNCEMENTS_CHANNEL_ID: z.string().regex(/^\d+$/).optional(),
    // Comma-separated Discord user IDs whose posts the ticker shows.
    DISCORD_ANNOUNCEMENTS_AUTHOR_IDS: z
      .string()
      .regex(/^\d+(,\d+)*$/)
      .optional(),
    DISCORD_APPLICATION_ID: z.string().regex(/^\d+$/).optional(),
    DISCORD_PUBLIC_KEY: z
      .string()
      .regex(/^[0-9a-f]{64}$/i)
      .optional(),
    DISCORD_INVITE_URL: z.url().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    AUTH_RESEND_KEY: process.env.AUTH_RESEND_KEY,
    AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    RIOT_DEVELOPER_API_KEY: process.env.RIOT_DEVELOPER_API_KEY,
    RIOT_PERSONAL_API_KEY: process.env.RIOT_PERSONAL_API_KEY,
    RIOT_TOURNAMENT_API_KEY: process.env.RIOT_TOURNAMENT_API_KEY,
    RIOT_TOURNAMENT_PROVIDER_ID: process.env.RIOT_TOURNAMENT_PROVIDER_ID,
    RIOT_TOURNAMENT_CALLBACK_SECRET: process.env.RIOT_TOURNAMENT_CALLBACK_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
    DISCORD_CAPTAIN_ROLE_ID: process.env.DISCORD_CAPTAIN_ROLE_ID,
    DISCORD_MATCHES_CHANNEL_ID: process.env.DISCORD_MATCHES_CHANNEL_ID,
    DISCORD_TEN_MAN_CHANNEL_ID: process.env.DISCORD_TEN_MAN_CHANNEL_ID,
    DISCORD_ANNOUNCEMENTS_CHANNEL_ID: process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID,
    DISCORD_ANNOUNCEMENTS_AUTHOR_IDS: process.env.DISCORD_ANNOUNCEMENTS_AUTHOR_IDS,
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
    DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
    DISCORD_INVITE_URL: process.env.DISCORD_INVITE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
  emptyStringAsUndefined: true,
});
