import "server-only";

import { headers } from "next/headers";

import { auth as betterAuth } from "@/lib/auth";

export type AppSession = {
  user: {
    id: string;
    email: string;
    username: string | null;
    name: string | null;
    role: "user" | "admin";
  };
};

export async function auth(): Promise<AppSession | null> {
  const session = await betterAuth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      username: (session.user as { username?: string | null }).username ?? null,
      name: session.user.name ?? null,
      role: ((session.user as { role?: string }).role ?? "user") as "user" | "admin",
    },
  };
}

export async function signOut(): Promise<void> {
  await betterAuth.api.signOut({ headers: await headers() });
}
