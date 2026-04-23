import { LinkButton } from "@/components/ui/link-button";
import { Reveal } from "@/components/ui/reveal";

export function CallToAction() {
  return (
    <section className="py-24 md:py-32" style={{ borderTop: "3px solid var(--accent)" }}>
      <div className="site-container">
        <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
          <h2 className="text-heading" style={{ color: "var(--text)" }}>
            Ready to get drafted?
          </h2>
          <p
            className="text-base leading-relaxed md:text-lg"
            style={{ color: "var(--muted)", maxWidth: "46ch" }}
          >
            Create an account, jump into the next open season, and let the captains fight over you.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <LinkButton href="/signup" variant="primary">
              Create an account
            </LinkButton>
            <LinkButton href="/seasons" variant="outline">
              Browse seasons
            </LinkButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
