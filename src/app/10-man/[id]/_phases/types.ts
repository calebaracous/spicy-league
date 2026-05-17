// Shared types mirroring TenManSnapshot but safe for client serialisation

export type SignupEntry = {
  userId: string;
  displayName: string;
  signupOrder: number;
  rolePrefs: unknown;
  joinedAt: string | Date;
};

export type VoteEntry = {
  voterUserId: string;
  candidateUserId: string;
};

export type CaptainEntry = {
  userId: string;
  displayName: string;
  captainOrder: number;
  voteCount: number;
};

export type PickEntry = {
  pickNumber: number;
  captainUserId: string;
  captainDisplayName: string;
  pickedUserId: string;
  pickedDisplayName: string;
  pickedAt: string | Date;
};

export type TenManSnapshotClient = {
  tenMan: {
    id: string;
    state: "signups" | "voting" | "drafting" | "ready" | "complete" | "cancelled";
    lobbyCode: string | null;
    winnerCaptainUserId: string | null;
    durationLabel: string | null;
    createdAt: string | Date;
  };
  signups: SignupEntry[];
  votes: VoteEntry[];
  tally: Record<string, number>;
  captains: CaptainEntry[];
  picks: PickEntry[];
  onTheClock: { pickNumber: number; captainUserId: string; captainOrder: number } | null;
  result: { winnerCaptainUserId: string; durationLabel: string | null } | null;
};
