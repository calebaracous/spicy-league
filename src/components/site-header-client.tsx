"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LogoMark } from "@/components/ui/logo-mark";
import { signInHref } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/seasons", label: "Seasons" },
  { href: "/history", label: "History" },
  { href: "/10-man", label: "10-man" },
];

export interface SiteHeaderUser {
  name: string | null;
  role: string | null;
}

export interface LiveSeasonPill {
  label: string;
  href: string;
}

export function SiteHeaderClient({
  user,
  livePill,
}: {
  user: SiteHeaderUser | null;
  livePill: LiveSeasonPill | null;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Close the menu on any navigation (incl. back/forward), not just link taps.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  const closeMenu = () => setMenuOpen(false);
  const signInLink = signInHref(pathname);

  const adminLink = user?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : [];
  const allLinks = [...navLinks, ...adminLink];

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 transition-all duration-300",
          scrolled ? "backdrop-blur-md" : "backdrop-blur-none",
        )}
        style={{
          borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
          backgroundColor: scrolled ? "rgba(10,10,10,0.85)" : "transparent",
        }}
      >
        <div
          className="site-container relative flex items-center justify-between"
          style={{ height: "var(--navbar-height)" }}
        >
          <Link
            href="/"
            className="relative z-10 inline-flex items-center gap-2 text-sm font-medium tracking-tight transition-opacity hover:opacity-60"
            style={{ color: "var(--text)" }}
            aria-label="Spicy League — home"
          >
            <LogoMark size={22} />
            <span>
              Spicy League<span style={{ color: "var(--accent-text)" }}>.</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 md:flex">
            {/* Live pill sits in the nav row (an absolutely centred pill
                collided with the links once Admin was added). Full label on
                wide screens, just "Live" below xl. */}
            {livePill ? (
              <Link
                href={livePill.href}
                title={livePill.label}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium tracking-wider whitespace-nowrap uppercase transition-opacity hover:opacity-80"
                style={{
                  color: "var(--accent-text)",
                  borderColor: "var(--border)",
                  backgroundColor: "rgba(10,10,10,0.4)",
                }}
              >
                <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                    style={{ backgroundColor: "var(--accent)" }}
                  />
                  <span
                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: "var(--accent)" }}
                  />
                </span>
                <span className="hidden xl:inline">{livePill.label}</span>
                <span className="xl:hidden">
                  Live<span className="sr-only">: {livePill.label}</span>
                </span>
              </Link>
            ) : null}
            {allLinks.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative text-sm transition-opacity",
                    active ? "font-medium opacity-100" : "opacity-50 hover:opacity-100",
                  )}
                  style={{ color: "var(--text)" }}
                >
                  {label}
                  {active ? (
                    <span
                      className="absolute -bottom-1 left-0 h-px w-full"
                      style={{ backgroundColor: "var(--accent)" }}
                    />
                  ) : null}
                </Link>
              );
            })}

            {user ? (
              <Link
                href="/profile"
                className="inline-flex items-center justify-center rounded-full border px-4 py-1.5 text-sm font-medium tracking-tight transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--text)",
                  borderColor: "var(--border)",
                }}
              >
                {user.name ?? "Profile"}
              </Link>
            ) : (
              <Link
                href={signInLink}
                className="inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium tracking-tight transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                  border: "1px solid var(--accent)",
                }}
              >
                Sign in
              </Link>
            )}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="relative z-10 flex h-8 w-8 cursor-pointer flex-col items-center justify-center gap-1.5 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <span
              className={cn(
                "block h-px w-5 origin-center transition-all duration-300",
                menuOpen ? "translate-y-[3.5px] rotate-45" : "",
              )}
              style={{ backgroundColor: "var(--text)" }}
            />
            <span
              className={cn(
                "block h-px w-5 transition-all duration-300",
                menuOpen ? "scale-x-0 opacity-0" : "",
              )}
              style={{ backgroundColor: "var(--text)" }}
            />
            <span
              className={cn(
                "block h-px w-5 origin-center transition-all duration-300",
                menuOpen ? "-translate-y-[3.5px] -rotate-45" : "",
              )}
              style={{ backgroundColor: "var(--text)" }}
            />
          </button>
        </div>
      </header>

      {/* Mobile overlay menu. `inert` while closed so its links aren't
          invisible tab stops. */}
      <div
        id="mobile-menu"
        inert={!menuOpen}
        className={cn(
          "fixed inset-0 z-40 flex flex-col items-center justify-center gap-10 md:hidden",
          "transition-all duration-300",
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{ backgroundColor: "var(--bg)" }}
      >
        {livePill ? (
          <Link
            href={livePill.href}
            onClick={closeMenu}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium tracking-wider uppercase"
            style={{ color: "var(--accent-text)", borderColor: "var(--border)" }}
          >
            <span
              className="inline-flex h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--accent)" }}
            />
            {livePill.label}
          </Link>
        ) : null}
        <Link
          href="/"
          onClick={closeMenu}
          aria-current={pathname === "/" ? "page" : undefined}
          className={cn(
            "text-3xl font-medium tracking-tight transition-opacity",
            pathname === "/" ? "opacity-100" : "opacity-50 hover:opacity-100",
          )}
          style={{ color: "var(--text)" }}
        >
          Home
        </Link>
        {allLinks.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={closeMenu}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-3xl font-medium tracking-tight transition-opacity",
                active ? "opacity-100" : "opacity-50 hover:opacity-100",
              )}
              style={{ color: "var(--text)" }}
            >
              {label}
            </Link>
          );
        })}
        {user ? (
          <Link
            href="/profile"
            onClick={closeMenu}
            className="text-3xl font-medium tracking-tight opacity-70 transition-opacity hover:opacity-100"
            style={{ color: "var(--text)" }}
          >
            {user.name ?? "Profile"}
          </Link>
        ) : (
          <Link
            href={signInLink}
            onClick={closeMenu}
            className="text-3xl font-medium tracking-tight transition-opacity"
            style={{ color: "var(--accent-text)" }}
          >
            Sign in
          </Link>
        )}
      </div>
    </>
  );
}
