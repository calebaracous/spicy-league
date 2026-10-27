import { Divider } from "@/components/ui/divider";
import { LinkButton } from "@/components/ui/link-button";
import { LocalTime } from "@/components/ui/local-time";
import { PlayerCard } from "@/components/ui/player-card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { TintedSection } from "@/components/ui/tinted-section";
import { VideoBackdrop } from "@/components/ui/video-backdrop";
import { backdropClip, placeholderBackdrop } from "@/lib/backdrop-clips";
import type { PlayerInfo } from "@/lib/homepage";
import type { Season } from "@/db/schema/seasons";
import { PrizePoolLine } from "./prize-pool-line";

interface SignupSectionProps {
  season: Season;
  signupCount: number;
  topPlayers?: PlayerInfo[]; // LoL only
}

const SIGNUP_TARGET: Record<string, number> = { lol: 30, cs2: 20 };

export function SignupSection({ season, signupCount, topPlayers }: SignupSectionProps) {
  const isLoL = season.game === "lol";
  const target = SIGNUP_TARGET[season.game] ?? 30;
  const pct = Math.min((signupCount / target) * 100, 100);
  const signupHref = `/seasons/${season.slug}/signup`;
  const infoHref = `/seasons/${season.slug}`;

  const sectionLabel = isLoL ? null : "SIGNUPS";
  const sectionHeading = isLoL ? (
    <>
      Highest-ranked <span style={{ color: "var(--accent-text)" }}>signups</span>
    </>
  ) : (
    <>
      Registered <span style={{ color: "var(--accent-text)" }}>players</span>
    </>
  );
  const sectionBody = isLoL ? null : "A random selection of players registered for this season.";

  return (
    <>
      {/* Signup banner */}
      <section
        className="relative isolate overflow-hidden"
        style={{
          paddingTop: "6rem",
          paddingBottom: "6rem",
          borderTop: "3px solid var(--accent)",
          borderBottom: "3px solid var(--accent)",
          background: "linear-gradient(180deg, rgba(185,28,28,0.06) 0%, var(--bg) 100%)",
        }}
      >
        <VideoBackdrop clip={placeholderBackdrop(season.game)} />
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

              <PrizePoolLine season={season} className="text-lg" />

              <p className="text-base leading-relaxed" style={{ color: "var(--muted)" }}>
                {season.signupClosesAt && (
                  <>
                    Signups close{" "}
                    <span style={{ color: "var(--text)" }}>
                      <LocalTime date={season.signupClosesAt} preset="weekday-datetime" />
                    </span>
                    .{" "}
                  </>
                )}
                {season.draftAt && (
                  <>
                    Draft{" "}
                    <span style={{ color: "var(--text)" }}>
                      <LocalTime date={season.draftAt} preset="weekday-datetime" />
                    </span>
                    .{" "}
                  </>
                )}
                {season.seasonStartAt && (
                  <>
                    Season starts{" "}
                    <span style={{ color: "var(--text)" }}>
                      <LocalTime date={season.seasonStartAt} preset="date" />
                    </span>
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
                  Season details
                </LinkButton>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Players grid */}
      {topPlayers && topPlayers.length > 0 && (
        <TintedSection tint="subtle-warm" backdrop={backdropClip(season.game, 2)}>
          <Reveal className="mb-14 flex flex-col gap-4">
            {sectionLabel ? <SectionLabel>{sectionLabel}</SectionLabel> : null}
            <h2 className="text-heading" style={{ color: "var(--text)" }}>
              {sectionHeading}
            </h2>
            {sectionBody ? (
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--muted)", maxWidth: "52ch" }}
              >
                {sectionBody}
              </p>
            ) : null}
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
        <TintedSection tint="subtle-warm" backdrop={backdropClip(season.game, 2)}>
          <Reveal className="flex max-w-xl flex-col gap-4">
            {sectionLabel ? <SectionLabel>{sectionLabel}</SectionLabel> : null}
            <h2 className="text-heading" style={{ color: "var(--text)" }}>
              {sectionHeading}
            </h2>
            {sectionBody ? (
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                {sectionBody}
              </p>
            ) : null}
          </Reveal>
        </TintedSection>
      )}
    </>
  );
}
