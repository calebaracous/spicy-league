import { cn } from "@/lib/utils";

interface DividerProps {
  className?: string;
}

export function Divider({ className }: DividerProps) {
  return (
    <hr
      className={cn("w-full border-none", className)}
      style={{ height: "1px", backgroundColor: "var(--color-border)" }}
    />
  );
}
