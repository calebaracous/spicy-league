/**
 * Discord usernames (`users.discordUsername`). Pure — shared by account
 * signup, the profile form and the season-signup gate.
 *
 * Discord's current usernames are 2–32 characters of lowercase letters,
 * digits, `_` and `.`, with no two periods in a row. We store the normalised
 * form so the unique constraint is case-insensitive in practice. Old-style
 * `name#1234` tags no longer exist and are rejected.
 */

export const DISCORD_USERNAME_HELP =
  "Your Discord username (not your display name): 2–32 letters, numbers, underscores or periods";

const DISCORD_USERNAME = /^[a-z0-9_.]{2,32}$/;

/** Trims, drops a leading `@`, lowercases. Returns null if it isn't a valid username. */
export function normalizeDiscordUsername(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!DISCORD_USERNAME.test(v) || v.includes("..")) return null;
  return v;
}
