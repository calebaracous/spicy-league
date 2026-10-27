import "server-only";

import { unstable_cache } from "next/cache";

import { discordConfig, listChannels, listMessages, listRoles } from "@/lib/discord-api";
import { tickerItems, type MentionNames } from "@/lib/discord-format";

/**
 * The home-page ticker: the latest messages in DISCORD_ANNOUNCEMENTS_CHANNEL_ID
 * (only DISCORD_ANNOUNCEMENTS_AUTHOR_IDS' posts, if set), as plain text.
 * Cached for 5 minutes (the home page is force-dynamic, so without this every
 * visit would call Discord). Needs the bot's Message Content intent, or every
 * message reads as empty. See docs/DISCORD.md.
 */

export const TICKER_COUNT = 6;

export type Announcement = {
  id: string;
  text: string;
  postedAt: string;
  /** Opens the message in Discord (works for server members). */
  url: string;
};

async function fetchAnnouncements(): Promise<Announcement[]> {
  const cfg = discordConfig();
  const channelId = cfg?.announcementsChannelId;
  if (!cfg || !channelId) return [];

  // Extra messages so skipped ones (other authors, pins, image-only posts)
  // don't leave gaps.
  const messages = await listMessages(cfg, channelId, 50);
  const all = messages.map((m) => m.content).join("\n");
  const [roles, channels] = await Promise.all([
    all.includes("<@&") ? listRoles(cfg) : [],
    all.includes("<#") ? listChannels(cfg) : [],
  ]);
  const names: MentionNames = {
    users: new Map(
      messages.flatMap((m) => m.mentions.map((u) => [u.id, u.global_name || u.username])),
    ),
    roles: new Map(roles.map((r) => [r.id, r.name])),
    channels: new Map(channels.map((c) => [c.id, c.name])),
  };
  return tickerItems(messages, names, TICKER_COUNT, cfg.announcementsAuthorIds).map((item) => ({
    ...item,
    url: `https://discord.com/channels/${cfg.guildId}/${channelId}/${item.id}`,
  }));
}

const cachedAnnouncements = unstable_cache(
  fetchAnnouncements,
  [
    "discord-announcements",
    process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? "",
    process.env.DISCORD_ANNOUNCEMENTS_AUTHOR_IDS ?? "",
  ],
  { revalidate: 300, tags: ["discord-announcements"] },
);

/** Latest announcements, or none if the bot isn't set up or Discord fails (never breaks the page). */
export async function getAnnouncements(): Promise<Announcement[]> {
  try {
    return await cachedAnnouncements();
  } catch (err) {
    console.error("[discord] announcements ticker:", err);
    return [];
  }
}
