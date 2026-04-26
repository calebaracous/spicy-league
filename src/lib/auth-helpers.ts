import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function getSession() {
  return auth();
}

export async function requireAuth(redirectTo = "/signin") {
  const session = await auth();
  if (!session?.user) {
    redirect(redirectTo);
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== "admin") {
    redirect("/");
  }
  return session;
}

// Username is now required at signup, so this guard should never fire for
// legitimate sessions. Redirect to signin as a safety net.
export async function requireOnboarded() {
  const session = await requireAuth();
  if (!session.user.username) {
    redirect("/signin");
  }
  return session;
}
