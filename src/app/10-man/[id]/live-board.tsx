"use client";

import { useEffect, useState } from "react";

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

  // Subscribe to SSE
  useEffect(() => {
    const es = new EventSource(`/api/ten-man/${tenManId}/stream`);
    es.addEventListener("update", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as TenManSnapshotClient;
        if (data) setSnap(data);
      } catch {
        // ignore parse errors
      }
    });
    es.onerror = () => {
      // Browser auto-reconnects
    };
    return () => es.close();
  }, [tenManId]);

  const state = snap.tenMan.state;

  return (
    <div className="site-container" style={{ paddingTop: "2rem", paddingBottom: "6rem" }}>
      {state === "signups" || state === "cancelled" ? (
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
