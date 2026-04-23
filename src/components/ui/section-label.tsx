import { cn } from "@/lib/utils";

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <span className={cn("text-label inline-block", className)} style={{ color: "var(--accent)" }}>
      {children}
    </span>
  );
}
