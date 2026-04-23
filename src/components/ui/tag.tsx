import { cn } from "@/lib/utils";

interface TagProps {
  label: string;
  className?: string;
}

export function Tag({ label, className }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide",
        className,
      )}
      style={{
        backgroundColor: "var(--surface)",
        color: "var(--muted)",
        border: "1px solid var(--border)",
      }}
    >
      {label}
    </span>
  );
}
