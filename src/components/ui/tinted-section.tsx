import { VideoBackdrop } from "@/components/ui/video-backdrop";
import type { BackdropClip } from "@/lib/backdrop-clips";
import { cn } from "@/lib/utils";

interface TintedSectionProps {
  tint?: "subtle-warm" | "none";
  backdrop?: BackdropClip;
  children: React.ReactNode;
  className?: string;
}

export function TintedSection({
  tint = "none",
  backdrop,
  children,
  className,
}: TintedSectionProps) {
  return (
    <section
      className={cn(
        tint === "subtle-warm" && "tint-subtle-warm",
        backdrop && "relative isolate overflow-hidden",
        "py-24 md:py-32",
        className,
      )}
    >
      {backdrop && <VideoBackdrop clip={backdrop} />}
      <div className="site-container">{children}</div>
    </section>
  );
}
