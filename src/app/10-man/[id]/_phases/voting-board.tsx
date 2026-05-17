"use client";

import { useState, useTransition } from "react";

import { castVote } from "../../actions";
import { Avatar, PhaseBanner } from "./shared";
import type { TenManSnapshotClient } from "./types";

export function VotingBoard({
  snap,
  tenManId,
  viewerUserId,
}: {
  snap: TenManSnapshotClient;
  tenManId: string;
  viewerUserId: string | null;
  isAdmin: boolean;
}) {
  const { signups, votes, tally } = snap;

  // Unique voter count
  const votersDone = new Set(votes.map((v) => v.voterUserId)).size;
  const progress = votersDone / 10;
  const allVoted = votersDone >= 10;

  // Viewer's current votes (optimistic)
  const serverVotes = votes
    .filter((v) => v.voterUserId === viewerUserId)
    .map((v) => v.candidateUserId);
  const [yourVotes, setYourVotes] = useState<string[]>(serverVotes);
  const [pending, startTransition] = useTransition();

  const isSignup = viewerUserId ? signups.some((s) => s.userId === viewerUserId) : false;

  const canVote = isSignup && !allVoted;

  function toggleVote(candidateId: string) {
    if (!canVote) return;
    const next = yourVotes.includes(candidateId)
      ? yourVotes.filter((v) => v !== candidateId)
      : yourVotes.length >= 2
        ? [yourVotes[1]!, candidateId]
        : [...yourVotes, candidateId];
    setYourVotes(next);

    if (next.length === 2) {
      startTransition(async () => {
        try {
          await castVote(tenManId, [next[0]!, next[1]!]);
        } catch {
          // revert to server state
          setYourVotes(serverVotes);
        }
      });
    }
  }

  const maxVotes = Math.max(1, ...Object.values(tally));

  // Sort by vote count desc
  const sorted = [...signups].sort((a, b) => {
    const va = tally[a.userId] ?? 0;
    const vb = tally[b.userId] ?? 0;
    return vb - va;
  });

  const right = (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {viewerUserId ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Your votes</span>
          <span
            style={{
              fontSize: 14,
              fontFamily: "var(--font-geist-mono)",
              color: yourVotes.length === 2 ? "var(--accent)" : "var(--text)",
            }}
          >
            {yourVotes.length}/2
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <PhaseBanner
        phaseLabel="CAPTAIN VOTE"
        title={`${votersDone} of 10 voted`}
        sub="Pick 2 — top 2 vote-getters become captains"
        progress={progress}
        right={right}
      />

      {/* Tap-cards variant */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {sorted.map((p) => {
          const votes = tally[p.userId] ?? 0;
          const isYourVote = yourVotes.includes(p.userId);
          const isLeading = votes >= 4;

          return (
            <button
              key={p.userId}
              onClick={() => toggleVote(p.userId)}
              disabled={!canVote || pending}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 16,
                borderRadius: 10,
                border: `1px solid ${isYourVote ? "var(--accent)" : "var(--border)"}`,
                background: isYourVote ? "rgba(185, 28, 28, 0.06)" : "var(--surface)",
                color: "var(--text)",
                fontFamily: "inherit",
                cursor: canVote && !pending ? "pointer" : "default",
                textAlign: "left",
                transition: "all 0.15s",
                overflow: "hidden",
              }}
            >
              {/* Vote count pill */}
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  borderRadius: 9999,
                  background: votes > 0 ? "rgba(185,28,28,0.12)" : "rgba(255,255,255,0.04)",
                  color: votes > 0 ? "var(--accent)" : "var(--muted)",
                  fontSize: 11,
                  fontFamily: "var(--font-geist-mono)",
                  fontWeight: 500,
                }}
              >
                {votes}
                <span style={{ fontSize: 10, opacity: 0.7 }}>
                  &nbsp;vote{votes !== 1 ? "s" : ""}
                </span>
              </div>

              {isLeading ? (
                <span
                  style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    fontSize: 10,
                    color: "var(--accent)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Leading
                </span>
              ) : null}

              {/* Avatar + name */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  marginTop: isLeading ? 18 : 8,
                }}
              >
                <Avatar name={p.displayName} size={56} captain={isYourVote} />
                <span style={{ fontSize: 14, fontWeight: 500, textAlign: "center" }}>
                  {p.displayName}
                </span>
              </div>

              {/* Vote-share bar */}
              <div
                style={{
                  height: 3,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 9999,
                  overflow: "hidden",
                  marginTop: "auto",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(votes / maxVotes) * 100}%`,
                    background: "var(--accent)",
                    transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
              </div>

              {/* Tap state */}
              <span
                style={{
                  fontSize: 12,
                  color: isYourVote ? "var(--accent)" : "var(--muted)",
                  fontWeight: 500,
                  textAlign: "center",
                }}
              >
                {isYourVote
                  ? "✓ You voted"
                  : !viewerUserId
                    ? "Sign in to vote"
                    : !isSignup
                      ? "Not in this lobby"
                      : allVoted
                        ? "Voting closed"
                        : "Tap to vote"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 0",
          borderTop: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {allVoted
            ? "All votes are in. Captains are being set."
            : `Waiting on ${10 - votersDone} player${10 - votersDone !== 1 ? "s" : ""} to vote…`}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Ties broken at random</span>
      </div>
    </div>
  );
}
