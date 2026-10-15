"use client";

import { useState } from "react";

import { LiveStatusDot } from "@/components/live-status";
import { useSnapshotStream } from "@/components/use-turn-alert";

import { CancelledBoard } from "./_phases/cancelled-board";
import { CompleteBoard } from "./_phases/complete-board";
import { DraftBoard } from "./_phases/draft-board";
import { ReadyBoard } from "./_phases/ready-board";
import { SignupBoard } from "./_phases/signup-board";
import { VotingBoard } from "./_phases/voting-board";
import type { TenManSnapshotClient } from "./_phases/types";

export function TenManLiveBoard({
  initial,
  tenManId,
  viewerUserId,
  isAdmin,
}: {
  initial: TenManSnapshotClient;
  tenManId: string;
  viewerUserId: string | null;
  isAdmin: boolean;
}) {
  const [snap, setSnap] = useState<TenManSnapshotClient>(initial);
  const liveStatus = useSnapshotStream<TenManSnapshotClient>(
    `/api/ten-man/${tenManId}/stream`,
    setSnap,
  );

  const state = snap.tenMan.state;
  const finished = state === "complete" || state === "cancelled";

  return (
    <div className="site-container" style={{ paddingTop: "2rem", paddingBottom: "6rem" }}>
      {finished ? null : (
        <div className="mb-3 flex justify-end">
          <LiveStatusDot status={liveStatus} />
        </div>
      )}
      {state === "cancelled" ? (
        <CancelledBoard snap={snap} />
      ) : state === "signups" ? (
        <SignupBoard
          snap={snap}
          tenManId={tenManId}
          viewerUserId={viewerUserId}
          isAdmin={isAdmin}
        />
      ) : state === "voting" ? (
        <VotingBoard
          snap={snap}
          tenManId={tenManId}
          viewerUserId={viewerUserId}
          isAdmin={isAdmin}
        />
      ) : state === "drafting" ? (
        <DraftBoard snap={snap} tenManId={tenManId} viewerUserId={viewerUserId} isAdmin={isAdmin} />
      ) : state === "ready" ? (
        <ReadyBoard snap={snap} tenManId={tenManId} isAdmin={isAdmin} />
      ) : state === "complete" ? (
        <CompleteBoard snap={snap} isAdmin={isAdmin} />
      ) : null}
    </div>
  );
}
