import Link from "next/link";
import { desc, ne } from "drizzle-orm";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { GAME_LABELS, SEASON_STATE_LABELS } from "@/lib/seasons";
import { SectionLabel } from "@/components/ui/section-label";
import { Reveal } from "@/components/ui/reveal";
import { LinkButton } from "@/components/ui/link-button";

export async function LatestSeasons() {
  const publicSeasons = await db.query.seasons.findMany({
    where: ne(seasons.state, "draft"),
    orderBy: [desc(seasons.createdAt)],
    limit: 3,
  });

  return (
    <section className="py-24 md:py-32">
      <div className="site-container">
        <Reveal className="mb-16 flex flex-col gap-4">
          <SectionLabel>SEASONS</SectionLabel>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            What&apos;s on right now
          </h2>
        </Reveal>

        {publicSeasons.length === 0 ? (
          <Reveal
            className="rounded-2xl p-10 text-center"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No public seasons yet. Check back soon — the next season opens signups here.
            </p>
          </Reveal>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {publicSeasons.map((season, i) => {
              const isComplete = season.state === "complete";
              return (
                <Reveal key={season.id} delay={i * 100}>
                  <Link
                    href={`/seasons/${season.slug}`}
                    className="group flex h-full flex-col gap-5 rounded-2xl p-8 transition-transform duration-300 hover:-translate-y-1"
                    style={{
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className="text-label"
                        style={{
                          color: isComplete ? "var(--muted)" : "var(--accent)",
                        }}
                      >
                        {SEASON_STATE_LABELS[season.state]}
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {GAME_LABELS[season.game]}
                      </span>
                    </div>

                    <div className="flex flex-1 flex-col gap-3">
                      <h3
                        className="text-xl leading-snug font-medium transition-opacity group-hover:opacity-80"
                        style={{ color: "var(--text)" }}
                      >
                        {season.name}
                      </h3>
                      {season.description ? (
                        <p
                          className="line-clamp-3 text-sm leading-relaxed"
                          style={{ color: "var(--muted)" }}
                        >
                          {season.description}
                        </p>
                      ) : null}
                    </div>

                    <span
                      className="inline-flex items-center gap-1.5 pt-2 text-sm font-medium"
                      style={{ color: "var(--accent)", borderTop: "1px solid var(--border)" }}
                    >
                      View season →
                    </span>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        )}

        <Reveal className="mt-14 flex justify-center" delay={150}>
          <LinkButton href="/seasons" variant="ghost">
            View all seasons →
          </LinkButton>
        </Reveal>
      </div>
    </section>
  );
}
