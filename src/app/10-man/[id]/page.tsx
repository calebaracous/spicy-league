import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { getTenManSnapshot } from "@/lib/ten-man";
import { TenManLiveBoard } from "./live-board";

export const metadata = { title: "10-man · Spicy League" };

export default async function TenManSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [snap, session] = await Promise.all([getTenManSnapshot(id), auth()]);
  if (!snap) notFound();

  return (
    <TenManLiveBoard
      initial={JSON.parse(JSON.stringify(snap))}
      tenManId={id}
      viewerUserId={session?.user?.id ?? null}
      isAdmin={session?.user?.role === "admin"}
    />
  );
}
