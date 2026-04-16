import "server-only";

import { headers } from "next/headers";

import { auth as betterAuth } from "@/lib/auth";

export type AppSession = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: "user" | "admin";
  };
};

/**
 * Drop-in replacement for the old NextAuth `auth()` call.
 * Returns a session shaped identically to what the rest of the app expects,
 * or null if there is no active session.
 */
export async function auth(): Promise<AppSession | null> {
  const session = await betterAuth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: (session.user as { displayName?: string | null }).displayName ?? null,
      role: ((session.user as { role?: string }).role ?? "user") as "user" | "admin",
    },
  };
}

/**
 * Server-action sign-out: invalidates the DB session and deletes the cookie.
 */
export async function signOut(): Promise<void> {
  await betterAuth.api.signOut({ headers: await headers() });
}
