/**
 * VsDivider — VS separator used on the ready + complete boards. Vertical
 * between side-by-side teams (md+), horizontal when teams stack on phones.
 */
export function VsDivider() {
  return (
    <div className="flex items-center justify-center gap-2 md:min-w-[72px] md:flex-col">
      <div className="h-px w-16 md:h-[60px] md:w-px" style={{ background: "var(--border)" }} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: "0.15em",
          color: "var(--accent-text)",
          padding: "6px 12px",
          border: "1px solid var(--accent)",
          borderRadius: 9999,
        }}
      >
        VS
      </span>
      <div className="h-px w-16 md:h-[60px] md:w-px" style={{ background: "var(--border)" }} />
    </div>
  );
}
