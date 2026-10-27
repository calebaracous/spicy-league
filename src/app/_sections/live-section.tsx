import { Divider } from "@/components/ui/divider";
import { LinkButton } from "@/components/ui/link-button";
import { LocalTime } from "@/components/ui/local-time";
import { PlayerCard } from "@/components/ui/player-card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { TintedSection } from "@/components/ui/tinted-section";
import { backdropClip } from "@/lib/backdrop-clips";
import type { NextMatchInfo, PlayerInfo } from "@/lib/homepage";
import type { Season } from "@/db/schema/seasons";
import { PrizePoolLine } from "./prize-pool-line";
import { SEASON_STATE_LABELS } from "@/lib/seasons";

interface LiveSectionProps {
  season: Season;
  nextMatch: NextMatchInfo | null;
  topPlayers: PlayerInfo[];
}

function matchLabel(round: number, stage: string): string {
  if (stage === "final") return "Final";
  if (stage === "semis") return "Semifinal";
  if (stage === "tiebreaker") return "Tiebreaker";
  return `Group stage · Round ${round}`;
}

export function LiveSection({ season, nextMatch, topPlayers }: LiveSectionProps) {
  const phaseLabel = SEASON_STATE_LABELS[season.state].toUpperCase();
  const matchesHref = `/seasons/${season.slug}/matches`;

  return (
    <>
      <TintedSection tint="subtle-warm" backdrop={backdropClip(season.game, 1)}>
        <Reveal className="mb-10 flex flex-col gap-4">
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
            <SectionLabel>{phaseLabel}</SectionLabel>
          </div>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            Next match
          </h2>
          <PrizePoolLine season={season} className="text-sm" />
        </Reveal>

        {nextMatch ? (
          <Reveal>
            <div
              className="rounded-2xl p-10"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-8">
                <div className="text-right">
                  <div className="text-label mb-2" style={{ color: "var(--muted)" }}>
                    Team
                  </div>
                  <div
                    className="text-2xl font-medium tracking-tight"
                    style={{ color: "var(--text)" }}
                  >
                    {nextMatch.homeTeamName}
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2 font-mono">
                  <span className="text-[11px] tracking-widest" style={{ color: "var(--muted)" }}>
                    VS
                  </span>
                  <span
                    className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold"
                    style={{
                      color: "var(--accent-text)",
                      border: "2px solid var(--accent)",
                    }}
                  >
                    —
                  </span>
                </div>

                <div>
                  <div className="text-label mb-2" style={{ color: "var(--muted)" }}>
                    Team
                  </div>
                  <div
                    className="text-2xl font-medium tracking-tight"
                    style={{ color: "var(--text)" }}
                  >
                    {nextMatch.awayTeamName}
                  </div>
                </div>
              </div>

              <div
                className="mt-6 flex items-center justify-between pt-6 text-sm"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <span style={{ color: "var(--muted)" }}>
                  {matchLabel(nextMatch.round, nextMatch.stage)}
                </span>
                <span className="font-mono" style={{ color: "var(--text)" }}>
                  {nextMatch.scheduledAt ? (
                    <LocalTime date={nextMatch.scheduledAt} preset="weekday-datetime" />
                  ) : (
                    "TBD"
                  )}
                </span>
              </div>
            </div>
          </Reveal>
        ) : (
          <Reveal>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No unplayed matches remain.
            </p>
          </Reveal>
        )}

        <Reveal className="mt-8">
          <LinkButton href={matchesHref} variant="primary">
            Matches &amp; standings →
          </LinkButton>
        </Reveal>
      </TintedSection>

      <Divider />

      <TintedSection tint="none" backdrop={backdropClip(season.game, 2)}>
        <Reveal className="mb-14 flex flex-col gap-4">
          <SectionLabel>TOP-RANKED PLAYERS</SectionLabel>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            Highest-ranked <span style={{ color: "var(--accent-text)" }}>players</span>
          </h2>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--muted)", maxWidth: "52ch" }}
          >
            Players in this season with a linked Riot account, ordered by solo queue rank.
          </p>
        </Reveal>

        {topPlayers.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topPlayers.map((p, i) => (
              <Reveal key={p.username} delay={i * 80}>
                <PlayerCard username={p.username} rank={p.rank} />
              </Reveal>
            ))}
          </div>
        ) : (
          <Reveal>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No rank data available. Current results are on the{" "}
              <a href={matchesHref} style={{ color: "var(--accent-text)" }}>
                standings page
              </a>
              .
            </p>
          </Reveal>
        )}
      </TintedSection>
    </>
  );
}
