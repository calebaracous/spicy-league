# Spicy League Design System

Design system and UI kit for **Spicy League** — a grassroots, friends-and-friends-of-friends-only captain's draft team league for League of Legends and Counter-Strike 2.

## Sources

This design system was extracted from:
- **Codebase**: `spicy-league/` — Next.js app with full UI components, marketing pages, admin flows, and game integration
- **Design System Documentation**: `spicy-league/docs/DESIGN-SYSTEM.md`
- **Architecture Documentation**: `spicy-league/docs/ARCHITECTURE.md` and related docs

## Brand Overview

**Spicy League** is a competitive gaming league with a sarcastic, sweaty-gamer-but-not-serious tone. It's been running since 2017, starting in StarCraft 2 and now focused on League of Legends and Counter-Strike 2. The brand is built on:

- **Community-first**: Friends and friends-of-friends only
- **Competitive but fun**: Real tournament structure with captain's draft, round-robin groups, playoffs
- **No-nonsense visual identity**: Dark background, cream text, dark red accent
- **9 seasons of history**: Established visual language and patterns

The site features a marketing homepage, season signup/management flows, live draft interfaces with SSE, match scheduling, and admin controls.

## Product Surface

The main product is a **Next.js web application** that serves both public-facing marketing content and authenticated user flows:
- Marketing homepage with hero, about, how-it-works sections
- Season listing and signup
- Live captain's draft interface (SSE-powered)
- Match scheduling and results
- User profiles and admin dashboard
- Authentication flows (sign in/up, password reset)

All surfaces share the same dark, minimal aesthetic with careful attention to animation timing and scroll reveals.

## Content Fundamentals

**Tone & Voice**: Spicy League's copy is conversational, self-aware, and unapologetically competitive. It doesn't take itself too seriously but respects the commitment players put in. The tone is "sweaty gamers who know they're being ridiculous but are all-in anyway."

**Characteristics**:
- **Direct, no fluff**: "Sign up, get drafted, play a group stage, survive playoffs, lift the trophy."
- **Sarcastic undertones**: "Prize pools, rivalries, and bad takes are included at no extra charge."
- **Community-oriented**: Uses "we" and speaks to the in-group ("for sweaty friends", "for the group chat")
- **Competitive but grounded**: "No smurfs, no throwing, show up on time." — clear rules, no pretense

**Casing & Formatting**:
- Section labels: ALL CAPS with letter-spacing (`COMMUNITY LEAGUE`, `ABOUT`)
- Headlines: Sentence case with minimal punctuation
- Body copy: Natural sentence case, relaxed line-height for readability

**Emoji usage**: Minimal. The 🌶 pepper appears as a brand icon/placeholder but is not used throughout copy. No gratuitous emoji.

**Perspective**: Second person ("you") in CTAs and onboarding flows, first person plural ("we") in brand/about copy. Never formal or corporate.

**Examples from the codebase**:
- Hero: "Captains-draft **tournaments** for sweaty friends"
- About: "A proper tournament, for the group chat"
- Stats: "9 seasons deep" (not "9 seasons completed" or "9 successful seasons")
- CTA: "Join the current season" (not "Register now" or "Sign up today")

## Visual Foundations

**Color Philosophy**: The entire design is dark-mode-only. Black background + cream text + dark red accent create a high-contrast, focused aesthetic that feels competitive and premium without being flashy.

**Color Palette**:
- `--bg: #0A0A0A` — Deep black page surface
- `--surface: #111111` — Slightly lighter black for cards/elevated surfaces
- `--border: #1F1F1F` — Subtle borders, barely visible
- `--text: #F5F0E8` — Warm cream for all body text
- `--muted: #6B6B6B` — Secondary text, de-emphasized UI
- `--accent: #B91C1C` — Dark red (Tailwind red-700), the ONLY brand color

**Typography**: Geist Sans (via `next/font/google`) for all UI. Fluid type scale using `clamp()` for responsive sizing. All headings use `font-weight: 500` and tight letter-spacing (`-0.025em` to `-0.03em`). Body text is generous: `1rem / 1.65 line-height`.

**Backgrounds**: Almost exclusively solid `--bg` or `--surface`. No gradients. No textures. One exception: the About section uses a large emoji (🌶) on a `--surface` card as a placeholder for brand imagery.

**Spacing System**: CSS custom properties for consistent rhythm:
- `--space-xs: 0.5rem`, `--space-sm: 0.75rem`, `--space-md: 1rem`
- `--space-lg: 1.5rem`, `--space-xl: 2.5rem`, `--space-2xl: 4rem`, `--space-3xl: 6rem`

**Borders & Dividers**: Always `1px solid var(--border)`. Rarely used — the design breathes with whitespace instead of heavy dividers.

**Shadows**: Not used. Cards are differentiated by background color (`--surface` vs `--bg`) and subtle borders.

**Corner Radius**: `10px` (0.625rem via `--radius`) for buttons, cards, and containers. Buttons specifically use `rounded-full` for a pill shape.

**Animation Philosophy**: 
- **Entrance animations**: `fadeUp`, `fadeIn`, `slideInLeft/Right` with `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)` — smooth, confident
- **Scroll reveals**: `.reveal` + `.reveal-visible` via IntersectionObserver, 0.8s duration
- **Timing**: Staggered delays (`.delay-100`, `.delay-200`, etc.) for sequential reveals
- **Page transitions**: Subtle 6px Y-offset fade on route change (0.35s)
- **Reduced motion**: All animations respect `prefers-reduced-motion`

**Hover States**: 
- Buttons: `opacity: 0.8` on hover (not color shifts)
- Links: `opacity: 0.5` default → `opacity: 1.0` on hover
- No scale/grow effects, no shadows — changes are subtle

**Active/Focus States**:
- Active nav links: `opacity: 1.0` + thin red underline (`var(--accent)`)
- Focus: Visible outlines using `--ring` (same red)

**Layout Patterns**:
- Fixed navbar: `--navbar-height: 64px`, becomes sticky with backdrop-blur on scroll
- Content wrapper: `.site-container` with `max-width: 1120px`
- Vertical rhythm: Large section padding (24–32 on mobile, 32–48 on desktop)
- Grid layouts: 2-column on desktop (`md:grid-cols-2`), single column on mobile

**Imagery**: The site uses minimal imagery. The flame logo is the primary visual. Placeholder emoji (🌶) used in About section. No photography, no illustrations (yet). Future imagery would likely be high-contrast, desaturated, or tinted red.

**Transparency & Blur**: Only used for sticky navbar on scroll: `backdrop-blur-md` + `rgba(10,10,10,0.85)` background.

**Visual Hierarchy**: Achieved through:
1. Size contrast (7rem display → 1rem body)
2. Color contrast (`--text` for primary, `--muted` for secondary)
3. Weight contrast (500 headings, 400 body)
4. Spacing (generous whitespace between sections)

**Component Visual Patterns**:
- **Cards**: `background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: var(--radius)`
- **Buttons**: Pill-shaped (`rounded-full`), three variants:
  - Primary: Red fill (`--accent`)
  - Outline: Transparent with border
  - Ghost: Transparent, no border, muted text
- **Tags/Pills**: Small, rounded, `--muted` text on transparent or `--surface` background
- **Form inputs**: Dark (`--surface`), cream text, red focus ring

**Brand Mark**: Two-path flame SVG. Outer flame in `--accent`, inner flame in `--text`. Scales proportionally. Used in header, favicon, and as standalone brand element.

## Iconography

**Approach**: Spicy League uses a minimal, functional approach to iconography. No icon font or dedicated icon library is wired — icons are used sparingly and only where necessary for clarity.

**Current Implementation**:
- **Logo/Brand Icon**: The flame logo (two-path SVG) is the primary brand mark. It appears in the header, favicon, PWA icons, and as a standalone visual.
- **No Icon Library**: The codebase doesn't import Lucide, Heroicons, Font Awesome, or any other icon set. Icons are hand-rolled SVG when needed, or omitted entirely.
- **Unicode Characters**: Occasionally used for minimal UI (e.g., arrows in button text like "See past seasons →")
- **Emoji**: Only the 🌶 pepper emoji appears as a placeholder in the About section. Not used throughout the UI.

**Guidelines**:
- Prefer text labels over icons ("Sign in" not just an icon)
- Use arrows (`→`) for directional hints in ghost buttons
- Keep any SVG icons simple, single-color, matching `--text` or `--muted`
- If icons are needed in future, choose a geometric, stroke-based set (like Lucide or Heroicons) at 1.5px stroke weight to match the minimal aesthetic

**Assets**: Logo SVG and PNG variants are in `/assets/`.

## Project Index

### Core Files
- **`README.md`** (this file) — Design system overview, brand context, visual/content foundations
- **`colors_and_type.css`** — Complete color palette and typography CSS custom properties
- **`SKILL.md`** — Agent skill definition for using this design system in projects

### Preview Cards (`/preview/`)
Interactive HTML specimens showing design tokens and components in isolation:
- `colors.html` — Color palette swatches
- `typography.html` — Type scale specimens
- `spacing.html` — Spacing token visualization
- `logo.html` — Brand mark at multiple sizes
- `buttons.html` — Button variants (primary, outline, ghost)
- `labels-tags.html` — Section labels and tag pills
- `card-forms.html` — Card containers and form inputs

### UI Kits (`/ui_kits/`)
High-fidelity recreations of production interfaces with modular React components:

#### Marketing Site (`/ui_kits/marketing-site/`)
Full homepage recreation with:
- Sticky header with scroll-triggered backdrop blur
- Hero section with live season indicator
- About section with brand context
- How It Works (3-step process cards)
- Latest Seasons grid
- Call-to-Action section
- Footer with navigation

All components are modular, interactive, and follow the exact visual language from the production codebase.

### Assets (`/assets/`)
- Logo SVG and PNG variants
- Brand mark at multiple resolutions (512px, 192px, 64px, 32px, 16px)
