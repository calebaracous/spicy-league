import { Divider } from "@/components/ui/divider";
import { LinkButton } from "@/components/ui/link-button";
import { CaptainBadge } from "@/components/ui/captain-badge";
import { PlayerCard } from "@/components/ui/player-card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { TintedSection } from "@/components/ui/tinted-section";
import { backdropClip } from "@/lib/backdrop-clips";
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
      <TintedSection tint="subtle-warm" backdrop={backdropClip(season.game, 1)}>
        <Reveal className="mb-14 flex flex-col gap-4">
          <SectionLabel>CAPTAINS</SectionLabel>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            {captains.reduce((n, c) => n + c.size, 0)}{" "}
            <span style={{ color: "var(--accent-text)" }}>captains</span>
          </h2>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--muted)", maxWidth: "52ch" }}
          >
            {isDrafting
              ? "The snake draft is in progress. Picks appear on the draft page as they are made."
              : "Captains have been selected. Picks will appear on the draft page once the draft starts."}
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
            {isDrafting ? "View the draft →" : "View season →"}
          </LinkButton>
        </Reveal>
      </TintedSection>

      <Divider />
      <TintedSection tint="none" backdrop={backdropClip(season.game, 2)}>
        <Reveal className="mb-14 flex flex-col gap-4">
          <SectionLabel>{season.game === "lol" ? "TOP-RANKED PLAYERS" : "PLAYERS"}</SectionLabel>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            {season.game === "lol" ? (
              <>
                Highest-ranked <span style={{ color: "var(--accent-text)" }}>non-captains</span>
              </>
            ) : (
              <>
                Registered <span style={{ color: "var(--accent-text)" }}>non-captains</span>
              </>
            )}
          </h2>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--muted)", maxWidth: "52ch" }}
          >
            {season.game === "lol"
              ? "Signed-up players who are not captains, ordered by solo queue rank."
              : "A random selection of signed-up players who are not captains."}
          </p>
        </Reveal>

        {topNonCaptains.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {topNonCaptains.map((p, i) => (
              <Reveal key={p.username} delay={i * 80}>
                <PlayerCard username={p.username} rank={p.rank} />
              </Reveal>
            ))}
          </div>
        ) : (
          <Reveal>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {season.game === "lol"
                ? "No rank data available. No signed-up players have linked a Riot account."
                : "No signups yet."}
            </p>
          </Reveal>
        )}
      </TintedSection>
    </>
  );
}
