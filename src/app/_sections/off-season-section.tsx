import { LinkButton } from "@/components/ui/link-button";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { TintedSection } from "@/components/ui/tinted-section";
import { backdropClip } from "@/lib/backdrop-clips";
import type { PodiumEntry } from "@/lib/homepage";
import type { Season } from "@/db/schema/seasons";

interface OffSeasonSectionProps {
  lastSeason: Season | null;
  podium: PodiumEntry[];
}

export function OffSeasonSection({ lastSeason, podium }: OffSeasonSectionProps) {
  return (
    <TintedSection tint="subtle-warm" backdrop={backdropClip(lastSeason?.game ?? "lol", 1)}>
      <Reveal className="mb-14 flex flex-col gap-4">
        <SectionLabel style={{ color: "var(--muted)" }}>OFF-SEASON</SectionLabel>
        <h2 className="text-heading" style={{ color: "var(--text)" }}>
          No season in progress<span style={{ color: "var(--accent-text)" }}>.</span>
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)", maxWidth: "52ch" }}>
          The next season has not been announced.
          {lastSeason ? " Final results from the most recent season are below." : null}
        </p>
      </Reveal>

      {lastSeason && (
        <Reveal>
          <div
            className="rounded-2xl p-8"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="mb-6 pb-6" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-xl font-medium tracking-tight" style={{ color: "var(--text)" }}>
                {lastSeason.name}
              </h3>
            </div>

            {podium.length > 0 && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {podium.map((p, i) => (
                  <Reveal key={p.rank} delay={i * 80}>
                    <div
                      className="flex flex-col gap-2 rounded-xl p-5"
                      style={{
                        background: p.rank === 1 ? "rgba(185,28,28,0.08)" : "var(--bg)",
                        border:
                          p.rank === 1
                            ? "1px solid rgba(185,28,28,0.3)"
                            : "1px solid var(--border)",
                      }}
                    >
                      <div
                        className="font-mono text-[11px] font-semibold"
                        style={{ color: p.rank === 1 ? "var(--accent-text)" : "var(--muted)" }}
                      >
                        {p.rank === 1 ? "1st" : p.rank === 2 ? "2nd" : p.rank === 3 ? "3rd" : "4th"}
                      </div>
                      <div
                        className="text-sm leading-snug font-medium"
                        style={{ color: "var(--text)" }}
                      >
                        {p.teamName}
                      </div>
                      <div
                        className="text-[11px] tracking-[0.05em] uppercase"
                        style={{ color: "var(--muted)" }}
                      >
                        {p.label}
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            )}

            <div
              className="mt-6 pt-6"
              style={{ borderTop: podium.length > 0 ? "1px solid var(--border)" : undefined }}
            >
              <LinkButton href="/history" variant="ghost">
                View season history →
              </LinkButton>
            </div>
          </div>
        </Reveal>
      )}

      {!lastSeason && (
        <Reveal>
          {/* Seasons 1–11 predate the app and live on /history, not in the DB. */}
          <LinkButton href="/history" variant="outline">
            Browse past seasons →
          </LinkButton>
        </Reveal>
      )}
    </TintedSection>
  );
}
