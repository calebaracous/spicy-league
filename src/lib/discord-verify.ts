/**
 * Discord interaction request signatures (Ed25519 over `timestamp + body`).
 * Discord rejects an Interactions Endpoint URL that doesn't verify, and sends
 * deliberately bad signatures to check. Pure WebCrypto, so it's unit-tested.
 */

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function verifyDiscordRequest(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!signatureHex || !timestamp) return false;
  const key = hexToBytes(publicKeyHex);
  const signature = hexToBytes(signatureHex);
  if (!key || !signature) return false;
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "Ed25519" }, false, [
      "verify",
    ]);
    return await crypto.subtle.verify(
      "Ed25519",
      cryptoKey,
      signature,
      new TextEncoder().encode(timestamp + rawBody),
    );
  } catch {
    return false;
  }
}
