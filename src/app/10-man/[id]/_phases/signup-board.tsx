"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { cancel10Man, joinSignup, leaveSignup } from "../../actions";
import { Avatar, PhaseBanner } from "./shared";
import type { TenManSnapshotClient } from "./types";

export function SignupBoard({
  snap,
  tenManId,
  viewerUserId,
  isAdmin,
}: {
  snap: TenManSnapshotClient;
  tenManId: string;
  viewerUserId: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { signups } = snap;
  const count = signups.length;
  const full = count >= 10;
  const hasJoined = viewerUserId ? signups.some((s) => s.userId === viewerUserId) : false;
  const emptyCount = Math.max(0, 10 - count);

  function handleJoin() {
    startTransition(() => joinSignup(tenManId));
  }
  function handleLeave() {
    startTransition(() => leaveSignup(tenManId));
  }
  function handleCancel() {
    startTransition(async () => {
      await cancel10Man(tenManId);
      router.push("/10-man");
    });
  }

  const right = (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {full && isAdmin ? (
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          Captain voting will open automatically.
        </span>
      ) : null}
      {!full && viewerUserId && !hasJoined ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={handleJoin}
          className="rounded-full"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
        >
          Join the 10-man
        </Button>
      ) : null}
      {!full && hasJoined ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={handleLeave}
          className="rounded-full"
        >
          Drop out
        </Button>
      ) : null}
      {isAdmin && !full ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={handleCancel}
          className="rounded-full"
        >
          Cancel session
        </Button>
      ) : null}
      {!viewerUserId && !full ? (
        <span style={{ fontSize: 13, color: "var(--muted)" }}>Sign in to join</span>
      ) : null}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <PhaseBanner
        phaseLabel={full ? "LOBBY FULL" : "SIGNUPS OPEN"}
        title={full ? "All 10 in." : `${count} of 10`}
        sub={
          full
            ? "Captain voting has started."
            : `Waiting on ${emptyCount} more player${emptyCount !== 1 ? "s" : ""}`
        }
        progress={count / 10}
        right={right}
      />

      {/* Slot grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {signups.map((p) => (
          <SignupCard key={p.userId} player={p} />
        ))}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <EmptySlot key={`empty-${i}`} n={count + i + 1} />
        ))}
      </div>
    </div>
  );
}

function formatJoinedAt(joinedAt: string | Date): string {
  const d = typeof joinedAt === "string" ? new Date(joinedAt) : joinedAt;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function SignupCard({
  player,
}: {
  player: { userId: string; displayName: string; signupOrder: number; joinedAt: string | Date };
}) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name={player.displayName} size={40} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            flex: 1,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {player.displayName}
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            joined {formatJoinedAt(player.joinedAt)}
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 10,
          borderTop: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--muted)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          #{String(player.signupOrder).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

function EmptySlot({ n }: { n: number }) {
  return (
    <div
      style={{
        padding: 16,
        background: "transparent",
        border: "1px dashed var(--border)",
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        minHeight: 116,
      }}
    >
      <SectionLabel style={{ color: "var(--muted)" }}>OPEN SLOT</SectionLabel>
      <span
        style={{
          fontSize: 12,
          color: "var(--muted)",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        #{String(n).padStart(2, "0")} of 10
      </span>
    </div>
  );
}
