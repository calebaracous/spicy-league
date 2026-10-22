"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-helpers";
import { markEventsSeen } from "@/lib/events";

/**
 * Marks everything up to when the page was rendered as read, so events that
 * arrived after the admin loaded the page stay unread.
 */
export async function markAllEventsRead(formData: FormData) {
  const session = await requireAdmin();
  const raw = String(formData.get("upTo") ?? "");
  const upTo = new Date(raw);
  const now = new Date();
  await markEventsSeen(session.user.id, Number.isNaN(upTo.getTime()) || upTo > now ? now : upTo);

  revalidatePath("/admin");
  revalidatePath("/admin/events");
  redirect("/admin/events?saved=read");
}
