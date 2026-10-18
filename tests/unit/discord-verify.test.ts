import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyDiscordRequest } from "@/lib/discord-verify";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicHex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const signed = (timestamp: string, body: string) =>
  sign(null, Buffer.from(timestamp + body), privateKey).toString("hex");

describe("verifyDiscordRequest", () => {
  const body = JSON.stringify({ type: 1 });
  const ts = "1797033600";

  it("accepts Discord's signature over timestamp + body", async () => {
    expect(await verifyDiscordRequest(publicHex, signed(ts, body), ts, body)).toBe(true);
  });

  it("rejects a tampered body, timestamp or signature", async () => {
    const sig = signed(ts, body);
    expect(await verifyDiscordRequest(publicHex, sig, ts, body + " ")).toBe(false);
    expect(await verifyDiscordRequest(publicHex, sig, "1797033601", body)).toBe(false);
    expect(await verifyDiscordRequest(publicHex, "00".repeat(64), ts, body)).toBe(false);
  });

  it("rejects missing or malformed headers", async () => {
    expect(await verifyDiscordRequest(publicHex, null, ts, body)).toBe(false);
    expect(await verifyDiscordRequest(publicHex, signed(ts, body), null, body)).toBe(false);
    expect(await verifyDiscordRequest(publicHex, "not-hex", ts, body)).toBe(false);
  });
});
