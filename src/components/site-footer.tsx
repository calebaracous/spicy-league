import Link from "next/link";

import { auth } from "@/auth";
import { LogoMark } from "@/components/ui/logo-mark";

const navLinks = [
  { href: "/seasons", label: "Seasons" },
  { href: "/history", label: "History" },
  { href: "/10-man", label: "10-man" },
  { href: "/users", label: "Players" },
];

// Muted links brighten to body text on hover (opacity was already 1, so the
// old hover:opacity-100 did nothing).
const footerLink = "text-[color:var(--muted)] transition-colors hover:text-[color:var(--text)]";

const legalLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
];

export async function SiteFooter() {
  const year = new Date().getFullYear();
  const session = await auth();
  const accountLinks = session
    ? [{ href: "/profile", label: "Profile" }]
    : [
        { href: "/signin", label: "Sign in" },
        { href: "/signup", label: "Create account" },
      ];

  return (
    <footer className="mt-24 pt-12 pb-10" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="site-container">
        <div className="mb-10 flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          {/* Left: wordmark + tagline */}
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-base font-medium tracking-tight transition-opacity hover:opacity-60"
              style={{ color: "var(--text)" }}
              aria-label="Spicy League — home"
            >
              <LogoMark size={20} />
              <span>
                Spicy League<span style={{ color: "var(--accent-text)" }}>.</span>
              </span>
            </Link>
            <p className="text-sm" style={{ color: "var(--muted)", maxWidth: "32ch" }}>
              Captains-draft tournaments for League of Legends and Counter-Strike 2.
            </p>
          </div>

          {/* Right: nav */}
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-12">
            <div className="flex flex-col gap-3">
              <p className="text-label" style={{ color: "var(--muted)" }}>
                Navigation
              </p>
              <nav className="flex flex-col gap-2.5" aria-label="Footer">
                {navLinks.map(({ href, label }) => (
                  <Link key={href} href={href} className={`text-sm ${footerLink}`}>
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-label" style={{ color: "var(--muted)" }}>
                Account
              </p>
              <nav className="flex flex-col gap-2.5" aria-label="Account">
                {accountLinks.map(({ href, label }) => (
                  <Link key={href} href={href} className={`text-sm ${footerLink}`}>
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>

        <div
          className="flex flex-col gap-3 pt-8 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            © {year} Spicy League.
          </p>
          <nav className="flex gap-5" aria-label="Legal">
            {legalLinks.map(({ href, label }) => (
              <Link key={href} href={href} className={`text-xs ${footerLink}`}>
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <p className="mt-6 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          Spicy League was created under Riot Games&apos; &ldquo;Legal Jibber Jabber&rdquo; policy
          using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
          Counter-Strike 2 footage is used under Valve&apos;s video policy.
        </p>
      </div>
    </footer>
  );
}
