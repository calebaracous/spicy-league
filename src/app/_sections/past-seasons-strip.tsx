import Link from "next/link";

import { LinkButton } from "@/components/ui/link-button";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import type { PastSeasonCard } from "@/lib/homepage";
import { GAME_LABELS } from "@/lib/seasons";

interface PastSeasonsStripProps {
  seasons: PastSeasonCard[];
}

export function PastSeasonsStrip({ seasons }: PastSeasonsStripProps) {
  if (seasons.length === 0) return null;

  return (
    <section className="py-24 md:py-32">
      <div className="site-container">
        <Reveal className="mb-14 flex flex-col gap-4">
          <SectionLabel>PAST SEASONS</SectionLabel>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            Built over{" "}
            <span style={{ color: "var(--accent)" }}>{seasons.length > 1 ? "years" : "time"}</span>
          </h2>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {seasons.map((s, i) => (
            <Reveal key={s.id} delay={i * 100}>
              <Link
                href={`/seasons/${s.slug}`}
                className="group flex h-full flex-col gap-5 rounded-2xl p-7 transition-transform duration-300 hover:-translate-y-1"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <SectionLabel className="opacity-50">{s.name.split(":")[0]}</SectionLabel>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {GAME_LABELS[s.game]}
                  </span>
                </div>

                <div className="flex-1">
                  {s.championName ? (
                    <>
                      <div className="mb-1 text-[11px]" style={{ color: "var(--muted)" }}>
                        Champion
                      </div>
                      <div
                        className="text-lg leading-snug font-medium tracking-tight transition-opacity group-hover:opacity-80"
                        style={{ color: "var(--text)" }}
                      >
                        {s.championName}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm" style={{ color: "var(--muted)" }}>
                      {s.name}
                    </div>
                  )}
                </div>

                <span
                  className="inline-flex items-center gap-1.5 pt-2 text-sm font-medium"
                  style={{ color: "var(--accent)", borderTop: "1px solid var(--border)" }}
                >
                  View season →
                </span>
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-12 flex justify-center" delay={150}>
          <LinkButton href="/history" variant="ghost">
            View full history →
          </LinkButton>
        </Reveal>
      </div>
    </section>
  );
}
