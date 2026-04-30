import { Divider } from "@/components/ui/divider";
import { LinkButton } from "@/components/ui/link-button";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { TintedSection } from "@/components/ui/tinted-section";
import type { Season } from "@/db/schema/seasons";
import { GAME_LABELS } from "@/lib/seasons";

interface UpcomingSectionProps {
  season: Season;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "TBD";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function UpcomingSection({ season }: UpcomingSectionProps) {
  const dates = [
    { label: "Signups open", value: formatDate(season.signupOpensAt) },
    { label: "Signups close", value: formatDate(season.signupClosesAt) },
    { label: "Tournament start", value: formatDate(season.seasonStartAt) },
  ].filter((d) => d.value !== "TBD");

  return (
    <>
      <TintedSection tint="subtle-warm">
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
              <SectionLabel className="opacity-50">FORMAT</SectionLabel>
              <div className="flex flex-col gap-3 text-sm leading-relaxed">
                <div>
                  <span style={{ color: "var(--muted)" }}>Game: </span>
                  <span style={{ color: "var(--text)" }}>{GAME_LABELS[season.game]}</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Structure: </span>
                  <span style={{ color: "var(--text)" }}>
                    Round-robin groups → single-elim playoffs
                  </span>
                </div>
              </div>
            </div>
          </Reveal>

          {dates.length > 0 && (
            <Reveal delay={100}>
              <div
                className="flex flex-col gap-3 rounded-2xl p-8"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <SectionLabel className="opacity-50">KEY DATES</SectionLabel>
                {dates.map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between py-2 text-[13px]"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <span style={{ color: "var(--muted)" }}>{label}</span>
                    <span className="font-mono" style={{ color: "var(--text)" }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </div>
      </TintedSection>

      <Divider />

      <TintedSection tint="none">
        <Reveal className="flex max-w-xl flex-col gap-4">
          <SectionLabel>GET READY</SectionLabel>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            Signups <span style={{ color: "var(--accent)" }}>open soon</span>
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            Make an account now so you&apos;re ready to register the moment signups open. Linked
            Riot accounts get auto-ranked.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <LinkButton href="/signup" variant="primary">
              Create an account
            </LinkButton>
            <button
              disabled
              title="Coming soon"
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium opacity-50"
              style={{
                background: "transparent",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              Notify me when signups open
            </button>
          </div>
        </Reveal>
      </TintedSection>
    </>
  );
}
