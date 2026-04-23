import { SectionLabel } from "@/components/ui/section-label";
import { Reveal } from "@/components/ui/reveal";

const steps = [
  {
    number: "01",
    title: "Sign up",
    description:
      "Create an account, then sign up for an open season. Tell us your role preferences and any notes for the captains.",
    items: [
      "Link your game accounts",
      "Set role / lane preferences",
      "Signups stay open until the deadline",
    ],
  },
  {
    number: "02",
    title: "Get drafted",
    description:
      "Captains are selected from the pool. A live snake draft assigns everyone to a team — watch it happen in real time.",
    items: [
      "Captains picked by admins",
      "Live, in-order snake draft",
      "Teams finalized before week 1",
    ],
  },
  {
    number: "03",
    title: "Play & win",
    description:
      "A round-robin group stage seeds teams into a single-elimination bracket. Finals happen on stream. Champion gets bragging rights.",
    items: ["Round-robin group stage", "Single-elim playoffs", "Finals on stream, MVP votes"],
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 md:py-32">
      <div className="site-container">
        <Reveal className="mb-16 flex flex-col gap-4">
          <SectionLabel>HOW IT WORKS</SectionLabel>
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            Three stages from signup to trophy
          </h2>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map(({ number, title, description, items }, i) => (
            <Reveal
              key={number}
              delay={i * 100}
              className="flex flex-col gap-6 rounded-2xl p-8 transition-transform duration-300 hover:-translate-y-1"
              style={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="font-mono text-sm font-medium" style={{ color: "var(--accent)" }}>
                {number}
              </span>

              <div className="flex flex-1 flex-col gap-3">
                <h3 className="text-lg leading-snug font-medium" style={{ color: "var(--text)" }}>
                  {title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  {description}
                </p>
              </div>

              <ul
                className="flex flex-col gap-2 pt-2"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                {items.map((item) => (
                  <li
                    key={item}
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--muted)" }}
                  >
                    — {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
