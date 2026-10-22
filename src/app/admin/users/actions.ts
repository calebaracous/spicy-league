"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { requireAdmin } from "@/lib/auth-helpers";
import { banUser, unbanUser } from "@/lib/bans";
import { logEvent } from "@/lib/events";

const DURATION_DAYS: Record<string, number | null> = {
  "1": 1,
  "7": 7,
  "30": 30,
  permanent: null,
};

const banSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
  duration: z.enum(["1", "7", "30", "permanent"]),
  back: z.string().optional(),
});

/** Keep the admin on the filtered/searched list they acted from. */
function backTo(raw: string | undefined, extra: string): string {
  const base = raw && raw.startsWith("/admin/users") ? raw : "/admin/users";
  return `${base}${base.includes("?") ? "&" : "?"}${extra}`;
}

export async function banUserAction(formData: FormData) {
  const session = await requireAdmin();
  const parsed = banSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason") || undefined,
    duration: formData.get("duration"),
    back: formData.get("back") || undefined,
  });
  if (!parsed.success) redirect(backTo(undefined, "error=invalid"));
  const { userId, reason, duration, back } = parsed.data;

  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, username: true },
  });
  if (!target) redirect(backTo(back, "error=not-found"));
  // Admins can't be banned (demote first) — also stops banning yourself.
  if (target.role === "admin" || target.id === session.user.id) {
    redirect(backTo(back, "error=cannot-ban-admin"));
  }

  const days = DURATION_DAYS[duration];
  const expiresAt = days ? new Date(Date.now() + days * 86_400_000) : null;
  await banUser({
    userId,
    adminId: session.user.id,
    reason: reason || null,
    expiresAt,
  });
  await logEvent("user.banned", {
    actorId: session.user.id,
    subjectUserId: userId,
    data: { reason: reason || null, expiresAt: expiresAt?.toISOString() ?? null },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  redirect(backTo(back, "saved=banned"));
}

export async function unbanUserAction(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const back = String(formData.get("back") ?? "") || undefined;
  if (!userId) redirect(backTo(back, "error=invalid"));

  await unbanUser(userId);
  await logEvent("user.unbanned", { actorId: session.user.id, subjectUserId: userId });

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  redirect(backTo(back, "saved=unbanned"));
}
