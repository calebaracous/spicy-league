import { cn } from "@/lib/utils";

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function SectionLabel({ children, className, style }: SectionLabelProps) {
  return (
    <span
      className={cn("text-label inline-block", className)}
      style={{ color: "var(--accent)", ...style }}
    >
      {children}
    </span>
  );
}
