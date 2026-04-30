interface CaptainBadgeProps {
  name: string;
}

export function CaptainBadge({ name }: CaptainBadgeProps) {
  return (
    <span
      className="inline-flex items-center rounded-[6px] px-[14px] py-[6px] text-[13px] font-medium tracking-[-0.01em]"
      style={{
        background: "rgba(185, 28, 28, 0.08)",
        border: "1px solid rgba(185, 28, 28, 0.25)",
        color: "var(--text)",
      }}
    >
      {name}
    </span>
  );
}
