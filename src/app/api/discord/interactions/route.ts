import { NextResponse } from "next/server";

import { handleCommand, type CommandOption } from "@/lib/discord-commands";
import { verifyDiscordRequest } from "@/lib/discord-verify";
import { env } from "@/lib/env";

/**
 * Discord's Interactions Endpoint URL (set in the developer portal) for the
 * bot's slash commands. Every request is signature-checked; Discord needs a
 * reply within 3 seconds. See docs/DISCORD.md → Slash commands.
 */

type Interaction = {
  type: number;
  data?: {
    name: string;
    options?: CommandOption[];
    resolved?: { users?: Record<string, { id: string; username: string }> };
  };
  member?: { user: { id: string; username: string } };
  user?: { id: string; username: string };
};

const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const EPHEMERAL = 64;

export async function POST(req: Request) {
  if (!env.DISCORD_PUBLIC_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 404 });
  }
  const body = await req.text();
  const ok = await verifyDiscordRequest(
    env.DISCORD_PUBLIC_KEY,
    req.headers.get("x-signature-ed25519"),
    req.headers.get("x-signature-timestamp"),
    body,
  );
  if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  const interaction = JSON.parse(body) as Interaction;
  if (interaction.type === PING) return NextResponse.json({ type: PONG });

  if (interaction.type === APPLICATION_COMMAND && interaction.data) {
    const invoker = interaction.member?.user ?? interaction.user;
    if (!invoker) return NextResponse.json({ error: "No user" }, { status: 400 });
    try {
      const result = await handleCommand(
        interaction.data.name,
        interaction.data.options ?? [],
        invoker,
        interaction.data.resolved?.users ?? {},
      );
      return NextResponse.json({
        type: CHANNEL_MESSAGE,
        data: {
          content: result.content,
          flags: result.ephemeral ? EPHEMERAL : 0,
          allowed_mentions: { parse: [] },
        },
      });
    } catch (err) {
      console.error("[discord] command failed", interaction.data.name, err);
      return NextResponse.json({
        type: CHANNEL_MESSAGE,
        data: { content: "Something went wrong. Try again in a minute.", flags: EPHEMERAL },
      });
    }
  }

  return NextResponse.json({ error: "Unsupported interaction" }, { status: 400 });
}
