import { SectionLabel } from "@/components/ui/section-label";
import { LinkButton } from "@/components/ui/link-button";

const stats = ["9 seasons run", "Captain's draft format", "LoL & CS2", "Community-run"];

interface HeroProps {
  liveLabel?: string;
  liveHref?: string;
}

export function Hero({ liveLabel, liveHref }: HeroProps) {
  return (
    <section className="site-container pt-28 pb-24 md:pt-36 md:pb-32">
      <div className="animate-fade-up mb-10 flex items-center gap-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ backgroundColor: "var(--accent)" }}
          />
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--accent)" }}
          />
        </span>
        <SectionLabel>{liveLabel ?? "COMMUNITY LEAGUE"}</SectionLabel>
      </div>

      <h1
        className="text-display animate-fade-up mb-8 delay-100"
        style={{ color: "var(--text)", maxWidth: "17ch" }}
      >
        Captains-draft
        <br />
        <span style={{ color: "var(--accent)" }}>tournaments</span> for sweaty friends
      </h1>

      <p
        className="animate-fade-up mb-12 text-lg leading-relaxed delay-200 md:text-xl"
        style={{ color: "var(--muted)", maxWidth: "52ch" }}
      >
        Sign up for a season, get drafted onto a team, and compete through a round-robin group stage
        into a single-elimination bracket. League of Legends and Counter-Strike 2.
      </p>

      <div className="animate-fade-up mb-20 flex flex-wrap items-center gap-4 delay-300">
        <LinkButton href={liveHref ?? "/seasons"} variant="primary">
          {liveHref ? "Join the current season" : "View seasons"}
        </LinkButton>
        <LinkButton href="/history" variant="ghost">
          See past seasons →
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
    </section>
  );
}
