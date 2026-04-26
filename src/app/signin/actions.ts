"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,24}$/;

export async function signInWithUsername(
  formData: FormData,
): Promise<{ error: string } | { ok: true }> {
  const rawUsername = (formData.get("username") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const rememberMe = formData.get("rememberMe") === "on";

  if (!USERNAME_PATTERN.test(rawUsername) || !password) {
    return { error: "Invalid username or password." };
  }

  const username = rawUsername.toLowerCase();

  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
    columns: { email: true, emailVerified: true },
  });

  if (!user) return { error: "Invalid username or password." };

  try {
    await auth.api.signInEmail({
      body: { email: user.email, password, rememberMe },
      headers: await headers(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const code = (err as { body?: { code?: string } } | undefined)?.body?.code;

    if (code === "EMAIL_NOT_VERIFIED" || /not verified/i.test(message)) {
      return { error: "Please verify your email before signing in. Check your inbox." };
    }
    if (code === "USER_BANNED") {
      return { error: "This account has been suspended." };
    }
    return { error: "Invalid username or password." };
  }

  return { ok: true };
}
