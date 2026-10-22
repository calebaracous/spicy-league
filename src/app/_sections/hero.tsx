import { LinkButton } from "@/components/ui/link-button";
import { SectionLabel } from "@/components/ui/section-label";
import { VideoBackdrop } from "@/components/ui/video-backdrop";
import { backdropClip, type BackdropGame } from "@/lib/backdrop-clips";

interface HeroProps {
  liveHref?: string;
  liveLabel?: string;
  game: BackdropGame;
}

export function Hero({ liveHref, liveLabel, game }: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden">
      <VideoBackdrop clip={backdropClip(game, 0)} />
      <div className="site-container pt-28 pb-24 md:pt-36 md:pb-32">
        {liveLabel && (
          <div className="animate-fade-up mb-10 flex items-center gap-2.5 delay-50">
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                style={{ background: "var(--accent)" }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            </span>
            <SectionLabel>{liveLabel}</SectionLabel>
          </div>
        )}
        <h1
          className="text-display animate-fade-up mb-8 delay-100"
          style={{ color: "var(--text)", maxWidth: "17ch" }}
        >
          Spicy League Season 12:{" "}
          <span className="block" style={{ color: "var(--accent-text)" }}>
            League of Legends
          </span>
        </h1>

        <p
          className="animate-fade-up mb-12 text-lg leading-relaxed delay-200 md:text-xl"
          style={{ color: "var(--muted)", maxWidth: "52ch" }}
        >
          gucci gang cashmoney
        </p>

        <div className="animate-fade-up flex flex-wrap items-center gap-4 delay-300">
          <LinkButton href={liveHref ?? "/seasons"} variant="primary">
            {liveHref ? "Current season" : "View seasons"}
          </LinkButton>
          <LinkButton href="/history" variant="ghost">
            Past seasons →
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
