import { cn } from "@/lib/utils";

interface TintedSectionProps {
  tint?: "subtle-warm" | "none";
  children: React.ReactNode;
  className?: string;
}

export function TintedSection({ tint = "none", children, className }: TintedSectionProps) {
  return (
    <section
      className={cn(tint === "subtle-warm" && "tint-subtle-warm", "py-24 md:py-32", className)}
    >
      <div className="site-container">{children}</div>
    </section>
  );
}
