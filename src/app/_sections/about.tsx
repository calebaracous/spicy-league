import { SectionLabel } from "@/components/ui/section-label";
import { Tag } from "@/components/ui/tag";
import { Reveal } from "@/components/ui/reveal";

const pillars = [
  "Captain's draft",
  "Round robin groups",
  "Single-elim playoffs",
  "League of Legends",
  "Counter-Strike 2",
  "Community-run",
  "9 seasons deep",
];

export function About() {
  return (
    <section className="py-24 md:py-32">
      <div className="site-container grid items-start gap-16 md:grid-cols-2 md:gap-24">
        <Reveal className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <SectionLabel>ABOUT</SectionLabel>
            <h2 className="text-heading" style={{ color: "var(--text)" }}>
              A proper tournament,
              <br />
              for the group chat
            </h2>
          </div>

          <div
            className="flex flex-col gap-5 text-base leading-relaxed"
            style={{ color: "var(--muted)" }}
          >
            <p>
              Spicy League started in 2017 as a way to give sweaty friends something real to compete
              for. Since then it&apos;s grown into a full format: sign up, get drafted, play a group
              stage, survive playoffs, lift the trophy.
            </p>
            <p>
              Every season is captain&apos;s-draft. A handful of captains are picked, the rest of
              the pool goes into a live snake draft, and teams are locked in before group stage
              begins. Prize pools, rivalries, and bad takes are included at no extra charge.
            </p>
            <p>
              Currently running League of Legends and Counter-Strike 2 seasons. Open to anyone in
              the community — no smurfs, no throwing, show up on time.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {pillars.map((label) => (
              <Tag key={label} label={label} />
            ))}
          </div>
        </Reveal>

        <Reveal delay={150} className="flex flex-col gap-0 md:sticky md:top-24">
          <div
            className="flex aspect-square items-center justify-center rounded-2xl text-6xl select-none"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--accent)",
            }}
          >
            🌶
          </div>
        </Reveal>
      </div>
    </section>
  );
}
