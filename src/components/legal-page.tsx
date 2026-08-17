import type { ReactNode } from "react";

type LegalPageProps = {
  title: string;
  updated: string;
  children: ReactNode;
};

/**
 * Shared chrome for the static legal documents (/terms, /privacy).
 * Prose styling lives in the `.legal-prose` block in globals.css so the
 * page bodies stay as plain semantic HTML.
 */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <div className="site-container py-16 md:py-24">
      <article className="legal-prose">
        <p className="text-label" style={{ color: "var(--muted)" }}>
          Legal
        </p>
        <h1 className="text-heading mt-3" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        <p className="text-small mt-4" style={{ color: "var(--muted)" }}>
          Last updated {updated}
        </p>
        <div className="mt-10">{children}</div>
      </article>
    </div>
  );
}
