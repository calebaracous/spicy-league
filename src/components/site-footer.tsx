import Link from "next/link";

import { LogoMark } from "@/components/ui/logo-mark";

const navLinks = [
  { href: "/seasons", label: "Seasons" },
  { href: "/history", label: "History" },
  { href: "/signup", label: "Sign up" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

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
                Spicy League<span style={{ color: "var(--accent)" }}>.</span>
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
              <nav className="flex flex-col gap-2.5">
                {navLinks.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="text-sm transition-opacity hover:opacity-100"
                    style={{ color: "var(--muted)" }}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-label" style={{ color: "var(--muted)" }}>
                Account
              </p>
              <nav className="flex flex-col gap-2.5">
                <Link
                  href="/signin"
                  className="text-sm transition-opacity hover:opacity-100"
                  style={{ color: "var(--muted)" }}
                >
                  Sign in
                </Link>
                <Link
                  href="/profile"
                  className="text-sm transition-opacity hover:opacity-100"
                  style={{ color: "var(--muted)" }}
                >
                  Profile
                </Link>
              </nav>
            </div>
          </div>
        </div>

        <div className="pt-8" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            © {year} Spicy League.
          </p>
        </div>
      </div>
    </footer>
  );
}
