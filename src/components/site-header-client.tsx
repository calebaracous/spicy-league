"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LogoMark } from "@/components/ui/logo-mark";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/seasons", label: "Seasons" },
  { href: "/history", label: "History" },
];

export interface SiteHeaderUser {
  displayName: string | null;
  role: string | null;
}

export function SiteHeaderClient({ user }: { user: SiteHeaderUser | null }) {
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
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

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
          className="site-container flex items-center justify-between"
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
              Spicy League<span style={{ color: "var(--accent)" }}>.</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 md:flex">
            {allLinks.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
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
                {user.displayName ?? "Profile"}
              </Link>
            ) : (
              <Link
                href="/signin"
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

      {/* Mobile overlay menu */}
      <div
        className={cn(
          "fixed inset-0 z-40 flex flex-col items-center justify-center gap-10 md:hidden",
          "transition-all duration-300",
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{ backgroundColor: "var(--bg)" }}
        aria-hidden={!menuOpen}
      >
        <Link
          href="/"
          onClick={closeMenu}
          className={cn(
            "text-3xl font-medium tracking-tight transition-opacity",
            pathname === "/" ? "opacity-100" : "opacity-40 hover:opacity-100",
          )}
          style={{ color: pathname === "/" ? "var(--accent)" : "var(--text)" }}
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
              className={cn(
                "text-3xl font-medium tracking-tight transition-opacity",
                active ? "opacity-100" : "opacity-40 hover:opacity-100",
              )}
              style={{ color: active ? "var(--accent)" : "var(--text)" }}
            >
              {label}
            </Link>
          );
        })}
        {user ? (
          <Link
            href="/profile"
            onClick={closeMenu}
            className="text-3xl font-medium tracking-tight transition-opacity hover:opacity-100"
            style={{ color: "var(--text)", opacity: 0.7 }}
          >
            {user.displayName ?? "Profile"}
          </Link>
        ) : (
          <Link
            href="/signin"
            onClick={closeMenu}
            className="text-3xl font-medium tracking-tight transition-opacity"
            style={{ color: "var(--accent)" }}
          >
            Sign in
          </Link>
        )}
      </div>
    </>
  );
}
