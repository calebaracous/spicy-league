import { Divider } from "@/components/ui/divider";
import { LinkButton } from "@/components/ui/link-button";
import { LocalTime } from "@/components/ui/local-time";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { TintedSection } from "@/components/ui/tinted-section";
import { backdropClip } from "@/lib/backdrop-clips";
import type { Season } from "@/db/schema/seasons";
import { GAME_LABELS, seasonSchedule } from "@/lib/seasons";
import { FEARLESS_DRAFT_RULE, formatStructure } from "@/lib/match-format";

interface UpcomingSectionProps {
  season: Season;
}

export function UpcomingSection({ season }: UpcomingSectionProps) {
  const dates = seasonSchedule(season);

  return (
    <>
      <TintedSection tint="subtle-warm" backdrop={backdropClip(season.game, 1)}>
        <Reveal className="mb-14 flex flex-col gap-4">
          <SectionLabel>UPCOMING SEASON</SectionLabel>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            {season.name}
          </h2>
          {season.description && (
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--muted)", maxWidth: "52ch" }}
            >
              {season.description}
            </p>
          )}
        </Reveal>

        <div className="grid gap-5 md:grid-cols-2">
          <Reveal>
            <div
              className="flex flex-col gap-4 rounded-2xl p-8"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <SectionLabel style={{ color: "var(--muted)" }}>FORMAT</SectionLabel>
              <div className="flex flex-col gap-3 text-sm leading-relaxed">
                <div>
                  <span style={{ color: "var(--muted)" }}>Game: </span>
                  <span style={{ color: "var(--text)" }}>{GAME_LABELS[season.game]}</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Structure: </span>
                  <span style={{ color: "var(--text)" }}>
                    {formatStructure(season.groupBestOf)}
                  </span>
                </div>
                {season.fearlessDraft && (
                  <div>
                    <span style={{ color: "var(--muted)" }}>Fearless draft: </span>
                    <span style={{ color: "var(--text)" }}>{FEARLESS_DRAFT_RULE}</span>
                  </div>
                )}
              </div>
            </div>
          </Reveal>

          {dates.length > 0 && (
            <Reveal delay={100}>
              <div
                className="flex flex-col gap-3 rounded-2xl p-8"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <SectionLabel style={{ color: "var(--muted)" }}>KEY DATES</SectionLabel>
                {dates.map(({ label, at, until }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between py-2 text-[13px]"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <span style={{ color: "var(--muted)" }}>{label}</span>
                    <span className="font-mono" style={{ color: "var(--text)" }}>
                      <LocalTime date={at} preset="weekday-datetime" />
                      {until ? (
                        <>
                          {" "}
                          – <LocalTime date={until} preset="date-short" />
                        </>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </div>
      </TintedSection>

      <Divider />

      <TintedSection tint="none" backdrop={backdropClip(season.game, 2)}>
        <Reveal className="flex max-w-xl flex-col gap-4">
          <SectionLabel>ACCOUNTS</SectionLabel>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            Signups <span style={{ color: "var(--accent-text)" }}>not yet open</span>
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            An account is required to sign up for a season. Players who link a Riot account have
            their solo queue rank shown on their profile and in the draft pool.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <LinkButton href="/signup" variant="primary">
              Create an account
            </LinkButton>
          </div>
        </Reveal>
      </TintedSection>
    </>
  );
}
