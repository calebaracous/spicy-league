/**
 * Post-sign-in destinations come from the `callbackUrl` query param, so they
 * are attacker-controllable. Only same-origin absolute paths are allowed —
 * "//evil.com" and "/\evil.com" are protocol-relative to browsers.
 */
export function safeCallbackUrl(raw: string | null | undefined, fallback = "/profile"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  // Bouncing back to an auth page after signing in is never what you want.
  if (/^\/(signin|signup|forgot-password|reset-password)(\/|\?|$)/.test(raw)) return fallback;
  return raw;
}

/** `/signin` link that returns the user to `path` afterwards. */
export function signInHref(path: string | null | undefined): string {
  const target = safeCallbackUrl(path, "");
  if (!target || target === "/") return "/signin";
  return `/signin?callbackUrl=${encodeURIComponent(target)}`;
}
