import { Divider } from "@/components/ui/divider";
import { LinkButton } from "@/components/ui/link-button";
import { CaptainBadge } from "@/components/ui/captain-badge";
import { PlayerCard } from "@/components/ui/player-card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { TintedSection } from "@/components/ui/tinted-section";
import type { CaptainInfo, PlayerInfo } from "@/lib/homepage";
import type { Season } from "@/db/schema/seasons";

interface DraftSectionProps {
  season: Season;
  captains: CaptainInfo[];
  topNonCaptains: PlayerInfo[];
}

export function DraftSection({ season, captains, topNonCaptains }: DraftSectionProps) {
  const isDrafting = season.state === "drafting";
  const draftHref = `/seasons/${season.slug}/draft`;
  const seasonHref = `/seasons/${season.slug}`;

  return (
    <>
      <TintedSection tint="subtle-warm">
        <Reveal className="mb-14 flex flex-col gap-4">
          <SectionLabel>CAPTAINS LOCKED IN</SectionLabel>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            {captains.length} captains. <span style={{ color: "var(--accent)" }}>One trophy.</span>
          </h2>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--muted)", maxWidth: "52ch" }}
          >
            {isDrafting
              ? "The live snake draft is underway. Watch picks happen in real time."
              : "Captains are selected. The draft is coming — watch picks happen in real time when it starts."}
          </p>
        </Reveal>

        {captains.length > 0 && (
          <Reveal className="mb-14 flex flex-wrap gap-3">
            {captains.map((c, i) => (
              <Reveal key={c.username} delay={i * 60}>
                <CaptainBadge name={c.username} />
              </Reveal>
            ))}
          </Reveal>
        )}

        <Reveal>
          <LinkButton href={isDrafting ? draftHref : seasonHref} variant="primary">
            {isDrafting ? "Watch the draft live →" : "View season →"}
          </LinkButton>
        </Reveal>
      </TintedSection>

      {topNonCaptains.length > 0 && (
        <>
          <Divider />
          <TintedSection tint="none">
            <Reveal className="mb-14 flex flex-col gap-4">
              <SectionLabel>PLAYERS TO WATCH OUT FOR</SectionLabel>
              <h2 className="text-heading" style={{ color: "var(--text)" }}>
                Highest-ranked <span style={{ color: "var(--accent)" }}>non-captains</span>
              </h2>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--muted)", maxWidth: "52ch" }}
              >
                Whoever lands these picks gets a serious advantage. Captains, choose wisely.
              </p>
            </Reveal>

            <div className="grid gap-3 sm:grid-cols-2">
              {topNonCaptains.map((p, i) => (
                <Reveal key={p.username} delay={i * 80}>
                  <PlayerCard username={p.username} rank={p.rank} />
                </Reveal>
              ))}
            </div>
          </TintedSection>
        </>
      )}
    </>
  );
}
