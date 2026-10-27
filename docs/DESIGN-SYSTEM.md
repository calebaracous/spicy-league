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
| `--muted` | `#858585` | secondary text, subtle UI (≥5:1 on `--bg`/`--surface`) |
| `--accent` | `#B91C1C` | brand red — Tailwind red-700. **Fills, borders, dots** |
| `--accent-text` | `#EF4444` | brand red **as text** (labels, links, highlights) |
| `--accent-fg` | `#F5F0E8` | text on red accent |

Contrast rules (WCAG AA): `--accent` is only 2.7:1 on `--bg`, so never use
it for text — use `--accent-text` (`style={{ color: "var(--accent-text)" }}`
or the `text-accent-text` utility). Don't fade text with `opacity`; use
`--muted` for de-emphasis instead.

Shadcn-side mirror (kept for the primitives): `--primary` is the brand red
(`var(--accent)`), so default `<Button>`/`<Badge>` are red CTAs.
`--secondary` and `--ring` use `oklch(0.5 0.19 25)`; `--destructive` is a
lighter `oklch(0.64 0.21 25)` so destructive *text* passes contrast.

**Name clash to know about:** shadcn's `muted`/`accent` mean *neutral hover
and chip surfaces*, not the freelance grey text / brand red. In `@theme`,
`bg-muted`/`hover:bg-accent` map to `--shadcn-muted`/`--shadcn-accent`
(dark greys). The freelance `--muted`/`--accent` are only used through
`var(...)` in inline styles.

## Typography

Fonts: Geist Sans + Geist Mono via `next/font/google` in
`src/app/layout.tsx`, wired to `--font-geist-sans` / `--font-geist-mono`
and exposed as `--font-sans` / `--font-mono`.

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

`.page` is the wrapper for app pages (seasons, teams, matches, profile,
admin, history, public profiles): same edges as `.site-container` plus
vertical padding, with each direct child capped at `--page-max` and
left-aligned so narrow content lines up with the header logo. Set the width
per page with an arbitrary property: `className="page flex-1 space-y-8
[--page-max:48rem]"`. Page titles use `<h1 className="text-heading">`.

`--navbar-height: 64px` is exposed so sticky-offset calculations can share
it (currently used only in `src/components/site-header-client.tsx`).

Spacing scale tokens `--space-xs` (0.5rem) → `--space-3xl` (6rem) and
`--container-max: 1120px` live in the same `:root` block.

`TintedSection` (`src/components/ui/tinted-section.tsx`) is the home-page
section wrapper: vertical padding + `.site-container`, with an optional
`tint="subtle-warm"` that applies the `.tint-subtle-warm` background wash
from `globals.css`.

`.legal-prose` styles plain semantic HTML (h2/h3/p/ul/a/code) on
`/terms` and `/privacy` via `LegalPage` (`src/components/legal-page.tsx`).

## Base-layer rules

Element-level defaults that utilities must be able to override (`a`, the
`:focus-visible` outline) live in `@layer base` in `globals.css`. Unlayered
CSS beats every Tailwind utility — the old unlayered `a { color: inherit }`
silently disabled all `text-*` colors on links. The `h1`–`h6` weight /
letter-spacing rules are still unlayered, so `font-bold`/`tracking-*` on
headings have no effect (headings render at 500 by design).

## Animation utilities

Named keyframes:
- `fadeUp`, `fadeIn`, `slideInLeft`, `slideInRight` — generic entrance
  animations
- `pageFade` — per-route transition (6px Y offset)

Utility classes:
- `.animate-fade-up`, `.animate-fade-in`, `.animate-slide-in-*`
- `.animate-page` — applied by `src/app/template.tsx` to every page
- `.delay-50/100/200/300/400/500/600/700` — animation-delay helpers

**Ticker**: `tickerScroll` + `.ticker` / `.ticker-viewport` / `.ticker-track`
/ `.ticker-copy` / `.ticker-item` (the home-page announcements band). The track
holds the list twice and slides by -50% for a seamless loop; paused on
hover/focus; under reduced motion it stops and becomes a scrollable row.

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

**Freelance-style (new)** — all use the hex tokens:
- General: `reveal.tsx`, `section-label.tsx`, `divider.tsx`, `tag.tsx`,
  `link-button.tsx`, `logo-mark.tsx`, `tinted-section.tsx`,
  `video-backdrop.tsx`.
- Player/draft: `player-card.tsx` (username + role/rank row),
  `captain-badge.tsx` (red-tinted name chip) — home sections.
- 10-man: `snake-order-strip.tsx` (8-cell C1/C2 order, exports
  `SNAKE_ORDER`), `vs-divider.tsx`.

The 10-man phase boards (`src/app/10-man/[id]/_phases/`) use mostly inline
`style={{…}}` with hex tokens plus local `Avatar` / `PhaseBanner` helpers
in `_phases/shared.tsx`.

When building new chrome: prefer the freelance primitives + hex tokens.
When touching existing forms / admin: keep using shadcn.

### Home-row video backdrops

Every full-width row on `/` has a muted, looping gameplay clip behind it at
50% opacity (`VideoBackdrop`, `src/components/ui/video-backdrop.tsx`), with a
`var(--bg)` fade at the top and bottom so rows blend together.

- **Which clip:** `backdropClip(game, index)` in `src/lib/backdrop-clips.ts`.
  Hero = index 0, state-section rows = 1, 2 (all the active season's game;
  off-season uses the last season's game, else LoL). PastSeasonsStrip shows
  `otherGame(game)` so both games appear. Indexes cycle through the clips
  available for that game.
- **Wiring:** `TintedSection` takes `backdrop={clip}` and adds
  `relative isolate overflow-hidden`. Hand-rolled sections (Hero, signup
  banner, PastSeasonsStrip) do the same by hand — the backdrop is `-z-10`, so
  the parent must create a stacking context (`isolate`).
- **Loading:** the `<video>` mounts only once the row is within 200px of the
  viewport, fades in on `canplay`, and pauses when off-screen. Reduced-motion
  and Save-Data users never get the video, only the poster.
- **Assets:** `public/videos/` (clips) and `public/videos/posters/`. LoL has
  three real clips (`lol-1..3`, 10s loops from our own replays: hero =
  `lol-1`, so the three LoL rows never repeat); CS2 is still SVG
  placeholders with `sources: []`, so no CS2 video is requested. The
  "Signups open" row deliberately has no footage: it uses
  `placeholderBackdrop(game)`, the still pre-footage art
  (`posters/lol-placeholder.svg`; `cs2-2.svg` for CS2). To add a
  clip: encode a 10s seamless loop at 1280×720/30fps, no audio, as AV1 WebM +
  H.264 MP4 (~1.5–3 MB each), save its first frame as `posters/<id>.jpg`, and
  set `sources: loopSources("<id>")`. The loop is made seamless by cutting
  11s and crossfading the last 1s into the first:
  ```bash
  # body = 1s..11s, head = 0s..1s; xfade body's tail into head → 10s loop
  ffmpeg -ss <start> -t 11 -i src.webm -filter_complex "[0:v]fps=30,scale=1280:720,format=yuv420p,split[a][b];[a]trim=1:11,setpts=PTS-STARTPTS[body];[b]trim=0:1,setpts=PTS-STARTPTS[head];[body][head]xfade=transition=fade:duration=1:offset=9[v]" -map "[v]" -an -c:v libsvtav1 -crf 42 -preset 4 <id>.webm
  # same filter → -c:v libx264 -crf 28 -preset slow -movflags +faststart <id>.mp4
  ```
  Raise the CRF (e.g. 47 / 31) for busy teamfights that come out over 3 MB.
  If the encode settings change, update the codec strings in `loopSources`.
- **Licensing:** footage must be our own recordings or official Riot / Valve
  material — both publishers allow game footage on free, non-commercial fan
  sites, but not other creators' videos. The Riot "Legal Jibber Jabber"
  notice in `site-footer.tsx` is required while LoL footage is used.

## Components that set the site shape

| Path | Role |
|---|---|
| `src/app/layout.tsx` | `<html>` + Geist fonts + SiteHeader + SiteFooter. |
| `src/app/template.tsx` | Adds `animate-page` to every route change. |
| `src/components/site-header.tsx` | Server component. Calls `auth()`, builds the live pill (season or 10-man). |
| `src/components/site-header-client.tsx` | Sticky nav: live pill, scroll-triggered blur+border, mobile hamburger overlay, session-aware actions. |
| `src/components/site-footer.tsx` | Footer: nav links + Terms / Privacy + Riot/Valve footage notice. |
| `src/app/_sections/*` | Home-page sections: Hero + one of Signup / Draft / Live / Upcoming / OffSeason + PastSeasonsStrip. |
| `src/app/page.tsx` | Picks the section from `getHomepageData()` (`src/lib/homepage.ts`). |

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

## Agent design-system reference

`.agents/design-system/` is a self-contained copy of the brand for agents
and offline previews: `README.md` + `SKILL.md`, `colors_and_type.css`
(mirror of the hex tokens), logo assets, `preview/*.html` swatches, and a
marketing-site UI kit. `src/app/globals.css` remains the source of truth —
update both if you change a token.

## Where to look when…

- …a color looks wrong → `src/app/globals.css` `:root` block. Both token
  systems live here.
- …an animation feels off → check for `.reveal` (intersection-triggered,
  0.8s) vs `.animate-fade-up` (immediate, 0.55s). Don't mix.
- …something flashes on route change → `template.tsx` is the per-route
  wrapper; if it's not being applied, page component might be exporting
  its own layout.
