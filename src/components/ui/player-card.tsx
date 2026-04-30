interface PlayerCardProps {
  username: string;
  rank?: string | null;
  role?: string | null;
}

export function PlayerCard({ username, rank, role }: PlayerCardProps) {
  return (
    <div
      className="flex items-center justify-between rounded-[10px] px-[18px] py-[14px]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {username}
        </span>
        {role && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {role}
          </span>
        )}
      </div>
      {rank && (
        <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
          {rank}
        </span>
      )}
    </div>
  );
}
