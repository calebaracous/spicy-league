import { LinkButton } from "@/components/ui/link-button";
import { SectionLabel } from "@/components/ui/section-label";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="site-container flex flex-col gap-6 py-24 md:py-32">
      <SectionLabel>404</SectionLabel>
      <h1 className="text-heading" style={{ color: "var(--text)" }}>
        Page not found<span style={{ color: "var(--accent-text)" }}>.</span>
      </h1>
      <p className="text-body" style={{ color: "var(--muted)", maxWidth: "52ch" }}>
        That page doesn&apos;t exist, or the season or match it pointed to isn&apos;t public.
      </p>
      <div className="flex flex-wrap gap-4">
        <LinkButton href="/" variant="primary">
          Go home
        </LinkButton>
        <LinkButton href="/seasons" variant="ghost">
          Browse seasons →
        </LinkButton>
      </div>
    </div>
  );
}
