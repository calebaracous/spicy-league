"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,24}$/;

export async function registerUser(formData: FormData): Promise<{ error: string } | undefined> {
  const email = (formData.get("email") as string).trim().toLowerCase();
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;
  const rawUsername = (formData.get("username") as string).trim();

  if (password !== confirm) return { error: "Passwords don't match." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  if (!USERNAME_PATTERN.test(rawUsername)) {
    return { error: "Username must be 3–24 characters: letters, numbers, underscore, or hyphen." };
  }
  const username = rawUsername.toLowerCase();

  const existing = await db.query.users.findFirst({
    where: eq(users.username, username),
    columns: { id: true },
  });
  if (existing) return { error: "That username is already taken." };

  const response = await auth.api.signUpEmail({
    body: { email, password, name: username },
    headers: await headers(),
  });

  if (!response?.user?.id) {
    return { error: "Something went wrong. Please try again." };
  }

  await db
    .update(users)
    .set({ username, updatedAt: new Date() })
    .where(eq(users.id, response.user.id));

  redirect("/signin/check-email?type=verify");
}
