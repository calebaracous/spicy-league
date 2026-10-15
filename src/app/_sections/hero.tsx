import { LinkButton } from "@/components/ui/link-button";
import { SectionLabel } from "@/components/ui/section-label";
import { VideoBackdrop } from "@/components/ui/video-backdrop";
import { backdropClip, type BackdropGame } from "@/lib/backdrop-clips";

const stats = ["11 seasons", "Captains-draft format", "LoL and CS2", "Community-run"];

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
          Captains-draft
          <br />
          <span style={{ color: "var(--accent)" }}>tournaments</span> for LoL and CS2
        </h1>

        <p
          className="animate-fade-up mb-12 text-lg leading-relaxed delay-200 md:text-xl"
          style={{ color: "var(--muted)", maxWidth: "52ch" }}
        >
          Players sign up for a season and are drafted onto teams of five by captains. Teams play a
          round-robin group stage, and the top four advance to a single-elimination bracket. Seasons
          are run for League of Legends and Counter-Strike 2.
        </p>

        <div className="animate-fade-up mb-20 flex flex-wrap items-center gap-4 delay-300">
          <LinkButton href={liveHref ?? "/seasons"} variant="primary">
            {liveHref ? "Current season" : "View seasons"}
          </LinkButton>
          <LinkButton href="/history" variant="ghost">
            Past seasons →
          </LinkButton>
        </div>

        <div
          className="animate-fade-up flex flex-wrap items-center gap-y-3 pt-8 delay-400"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {stats.map((stat, i) => (
            <div key={stat} className="flex items-center">
              {i > 0 ? (
                <span
                  className="mx-6 hidden h-4 w-px shrink-0 sm:block"
                  style={{ backgroundColor: "var(--border)" }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="pr-4 text-sm sm:pr-0" style={{ color: "var(--muted)" }}>
                {stat}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
