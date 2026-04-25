# Design system

Two token systems coexist in `src/app/globals.css`: a **freelance-style
system** (hex-based, used by all new/bespoke chrome) and the **shadcn
OKLCH system** (used by the existing shadcn/ui primitives under
`src/components/ui/`). Don't delete the shadcn set — existing admin and
form surfaces depend on it.

## Brand mark

The flame is a two-path SVG: outer in `--accent` (`#B91C1C`), inner in
`--text` (`#F5F0E8`). Source-of-truth lives in
`src/components/ui/logo-mark.tsx` (the public `logo.svg` / `icon-512.svg`
files mirror it for OG/PWA use). Drop `<LogoMark size={N} />` anywhere
on a dark background — it inherits the design tokens, so it follows any
future theme change without edits. For a light surface, pass an explicit
`outerColor` / `innerColor`.

## Color palette

Dark background + cream text + dark red accent. Black and dark-red pair
("spicy").

| Token | Hex | Purpose |
|---|---|---|
| `--bg` | `#0A0A0A` | page surface |
| `--surface` | `#111111` | cards |
| `--border` | `#1F1F1F` | 1px dividers, card outlines |
| `--text` | `#F5F0E8` | body copy |
| `--muted` | `#6B6B6B` | secondary text, subtle UI |
| `--accent` | `#B91C1C` | brand red — Tailwind red-700 |
| `--accent-fg` | `#F5F0E8` | text on red accent |

Shadcn-side mirror (kept for the primitives): `--destructive`,
`--secondary`, `--ring` all tuned to the same red via
`oklch(0.5 0.19 25)`.

## Typography

Font: Geist Sans via `next/font/google` in `src/app/layout.tsx`, wired to
`--font-geist-sans`.

Utility classes (in `globals.css`):

| Class | Clamp | Use |
|---|---|---|
| `.text-display` | `clamp(3rem, 8vw, 7rem)` | hero headlines |
| `.text-heading` | `clamp(1.75rem, 4vw, 3rem)` | section titles |
| `.text-subheading` | `clamp(1.125rem, 2.5vw, 1.5rem)` | deck / subtitles |
| `.text-body` | `1rem / 1.65` | paragraphs |
| `.text-small` | `0.875rem / 1.5` | captions |
| `.text-label` | `0.75rem / 0.1em tracking / uppercase` | eyebrow labels |

All headings default to `font-weight: 500` and `letter-spacing: -0.025em`.

## Layout primitives

`.site-container` is the canonical content wrapper: `max-width: 1120px`,
horizontal padding that grows at `md`. Prefer this over ad-hoc
`max-w-6xl mx-auto px-6` — keeps the whole site aligned.

`--navbar-height: 64px` is exposed so sticky-offset calculations can share
it (currently used only in `src/components/site-header-client.tsx`).

## Animation utilities

Named keyframes:
- `fadeUp`, `fadeIn`, `slideInLeft`, `slideInRight` — generic entrance
  animations
- `pageFade` — per-route transition (6px Y offset)

Utility classes:
- `.animate-fade-up`, `.animate-fade-in`, `.animate-slide-in-*`
- `.animate-page` — applied by `src/app/template.tsx` to every page
- `.delay-50/100/200/300/400/500/600/700` — animation-delay helpers

**Scroll reveal**: `.reveal` + `.reveal-visible` (CSS) combined with
`Reveal` (React, `src/components/ui/reveal.tsx`). Uses IntersectionObserver.
Reduced-motion users get the visible state via CSS media query — no JS
branch needed (removed to satisfy React 19's `set-state-in-effect` lint).

Ease curves: `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)` is the
house curve. Use it for entrance animations. `--ease-in-out` for
symmetric transitions.

## Primitives

`src/components/ui/` has two flavors:

**shadcn (existing, don't rewrite)** — `alert.tsx`, `badge.tsx`,
`button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `select.tsx`,
`separator.tsx`, `sonner.tsx`, `textarea.tsx`. All use the OKLCH tokens
and `@base-ui/react` for accessibility.

**Freelance-style (new)** — `reveal.tsx`, `section-label.tsx`,
`divider.tsx`, `tag.tsx`, `link-button.tsx`, `logo-mark.tsx`. All use the
hex tokens.

When building new chrome: prefer the freelance primitives + hex tokens.
When touching existing forms / admin: keep using shadcn.

## Components that set the site shape

| Path | Role |
|---|---|
| `src/app/layout.tsx` | `<html>` + Geist fonts + SiteHeader + SiteFooter. |
| `src/app/template.tsx` | Adds `animate-page` to every route change. |
| `src/components/site-header.tsx` | Server component. Calls `auth()`. |
| `src/components/site-header-client.tsx` | Sticky nav: scroll-triggered blur+border, mobile hamburger overlay, session-aware actions. |
| `src/components/site-footer.tsx` | Two-column footer. |
| `src/app/_sections/*` | Home-page sections: Hero, About, HowItWorks, LatestSeasons, CallToAction. |
| `src/app/page.tsx` | Composes the sections + pulls a live season for hero CTA. |

## Conventions

- Prefer **style tokens** (`style={{ color: "var(--muted)" }}`) over
  Tailwind color classes on new freelance-style chrome. The design is
  dark-mode-only so CSS vars are fine.
- **Never** use `text-yellow-*`, `bg-yellow-*`, `text-primary` and expect
  the freelance amber — that was replaced with dark red. Use `--accent`.
- `cn()` from `src/lib/utils.ts` for conditional classes (clsx +
  tailwind-merge).
- Animation delays go on the animating element via `.delay-*` classes,
  not inline `animationDelay`.

## Dark mode

The site is **always dark**. `@custom-variant dark (&:is(.dark *))` is
set up so shadcn components don't explode when they look for `.dark`, but
no toggle is wired. Light-mode values in `globals.css` are actually dark
values — this predates the design pass. If you ever want a light mode,
it'll require a proper token pair.

## Where to look when…

- …a color looks wrong → `src/app/globals.css` `:root` block. Both token
  systems live here.
- …an animation feels off → check for `.reveal` (intersection-triggered,
  0.8s) vs `.animate-fade-up` (immediate, 0.55s). Don't mix.
- …something flashes on route change → `template.tsx` is the per-route
  wrapper; if it's not being applied, page component might be exporting
  its own layout.
