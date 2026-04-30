import { Divider } from "@/components/ui/divider";
import { LinkButton } from "@/components/ui/link-button";
import { PlayerCard } from "@/components/ui/player-card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { TintedSection } from "@/components/ui/tinted-section";
import type { PlayerInfo } from "@/lib/homepage";
import type { Season } from "@/db/schema/seasons";

interface SignupSectionProps {
  season: Season;
  signupCount: number;
  topPlayers?: PlayerInfo[]; // LoL only
}

const SIGNUP_TARGET: Record<string, number> = { lol: 30, cs2: 20 };

function formatDate(d: Date | null | undefined): string {
  if (!d) return "TBD";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function SignupSection({ season, signupCount, topPlayers }: SignupSectionProps) {
  const isLoL = season.game === "lol";
  const target = SIGNUP_TARGET[season.game] ?? 30;
  const pct = Math.min((signupCount / target) * 100, 100);
  const signupHref = `/seasons/${season.slug}/signup`;
  const infoHref = `/seasons/${season.slug}`;

  const sectionLabel = isLoL ? "PLAYERS TO WATCH" : "HIGHLIGHTED PLAYERS";
  const sectionHeading = isLoL ? (
    <>
      The pool is <span style={{ color: "var(--accent)" }}>stacked</span>
    </>
  ) : (
    <>
      Some faces <span style={{ color: "var(--accent)" }}>to know</span>
    </>
  );
  const sectionBody = isLoL
    ? "Pulled live from Riot — these are the highest-ranked players who've linked their accounts and signed up."
    : "A few notable players from the signup pool. Drafted captains will be fighting over these picks.";

  return (
    <>
      {/* Signup banner */}
      <section
        style={{
          paddingTop: "6rem",
          paddingBottom: "6rem",
          borderTop: "3px solid var(--accent)",
          borderBottom: "3px solid var(--accent)",
          background: "linear-gradient(180deg, rgba(185,28,28,0.06) 0%, var(--bg) 100%)",
        }}
      >
        <div className="site-container">
          <Reveal>
            <div className="flex max-w-2xl flex-col gap-6">
              <div className="flex items-center gap-2.5">
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
                <SectionLabel>SIGNUPS OPEN</SectionLabel>
              </div>

              <h2 className="text-heading" style={{ color: "var(--text)" }}>
                {season.name}
              </h2>

              <p className="text-base leading-relaxed" style={{ color: "var(--muted)" }}>
                {season.signupClosesAt && (
                  <>
                    Signups close{" "}
                    <span style={{ color: "var(--text)" }}>
                      {formatDate(season.signupClosesAt)}
                    </span>
                    .{" "}
                  </>
                )}
                {season.seasonStartAt && (
                  <>
                    Tournament starts{" "}
                    <span style={{ color: "var(--text)" }}>{formatDate(season.seasonStartAt)}</span>
                    .
                  </>
                )}
              </p>

              {/* Signup progress */}
              <div className="max-w-xs">
                <div className="mb-2 flex justify-between text-[13px]">
                  <span style={{ color: "var(--muted)" }}>Signups</span>
                  <span className="font-mono" style={{ color: "var(--text)" }}>
                    {signupCount} / {target}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ background: "var(--surface)" }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${pct}%`, background: "var(--accent)" }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <LinkButton href={signupHref} variant="primary" className="px-7 py-3.5 text-base">
                  Sign up for {season.name.split(":")[0]} →
                </LinkButton>
                <LinkButton href={infoHref} variant="outline" className="px-7 py-3.5 text-base">
                  Tournament info
                </LinkButton>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Players grid */}
      {topPlayers && topPlayers.length > 0 && (
        <TintedSection tint="subtle-warm">
          <Reveal className="mb-14 flex flex-col gap-4">
            <SectionLabel>{sectionLabel}</SectionLabel>
            <h2 className="text-heading" style={{ color: "var(--text)" }}>
              {sectionHeading}
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--muted)", maxWidth: "52ch" }}
            >
              {sectionBody}
            </p>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            {topPlayers.map((p, i) => (
              <Reveal key={p.username} delay={i * 80}>
                <PlayerCard username={p.username} rank={p.rank} />
              </Reveal>
            ))}
          </div>
        </TintedSection>
      )}

      {/* CS2: no ranked player data — show prompt instead */}
      {!topPlayers && (
        <TintedSection tint="subtle-warm">
          <Reveal className="flex max-w-xl flex-col gap-4">
            <SectionLabel>{sectionLabel}</SectionLabel>
            <h2 className="text-heading" style={{ color: "var(--text)" }}>
              {sectionHeading}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              {sectionBody}
            </p>
          </Reveal>
        </TintedSection>
      )}
    </>
  );
}
