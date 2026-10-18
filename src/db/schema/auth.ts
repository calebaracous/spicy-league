import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

// ── Users ──────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  username: text("username").unique(),
  bio: text("bio"),
  pronouns: text("pronouns"),
  role: userRoleEnum("role").default("user").notNull(),
  opggUrl: text("opgg_url"),
  // Discord username (new-style handle, stored lowercased; see
  // src/lib/discord.ts). Required at account signup and for season signups;
  // null on older accounts until they add it on /profile.
  discordUsername: text("discord_username").unique(),
  // Discord's numeric user ID, resolved from discordUsername by searching the
  // league server (src/lib/discord-roles.ts). Cleared when the username changes.
  discordUserId: text("discord_user_id"),
  // Opted in on /profile to the Discord "10-man" ping role.
  tenManPings: boolean("ten_man_pings").notNull().default(false),
  // League ban (see src/lib/bans.ts). Active while bannedAt is set and
  // banExpiresAt is null (permanent) or in the future.
  bannedAt: timestamp("banned_at", { mode: "date" }),
  banReason: text("ban_reason"),
  banExpiresAt: timestamp("ban_expires_at", { mode: "date" }),
  bannedBy: text("banned_by"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ── Sessions (Better Auth) ──────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ── Accounts (Better Auth — stores hashed password for email/password auth) ─
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: "date" }),
  scope: text("scope"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ── Verifications (Better Auth — email verification + password reset tokens) ─
export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
