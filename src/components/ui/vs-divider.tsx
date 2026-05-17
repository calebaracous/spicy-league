/**
 * VsDivider — vertical VS separator used on the ready + complete boards.
 */
export function VsDivider() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minWidth: 72,
      }}
    >
      <div style={{ width: 1, height: 60, background: "var(--border)" }} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: "0.15em",
          color: "var(--accent)",
          padding: "6px 12px",
          border: "1px solid var(--accent)",
          borderRadius: 9999,
        }}
      >
        VS
      </span>
      <div style={{ width: 1, height: 60, background: "var(--border)" }} />
    </div>
  );
}
