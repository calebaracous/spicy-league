# Handoff: 10-man Feature

A single, one-off 5v5 pickup match flow for Spicy League — alongside the existing season system, but completely standalone. Five phases: signup → captain vote → snake draft → ready/lobby → result/complete.

## About the Design Files

The files in `prototype/` are **design references created in HTML** — a clickable prototype showing the intended look and behavior. They are **not production code to copy directly**.

The task is to **recreate these HTML designs in the existing `spicy-league/` Next.js codebase** using its established patterns: Drizzle ORM, React Server Components, server actions, Server-Sent Events for live updates, the existing `@/components/ui/*` primitives, and Tailwind classes that resolve to the design tokens in `src/app/globals.css`.

Two reference docs ship in this handoff:

- **`README.md`** (this file) — design spec: every screen, layout, component, color, copy line.
- **`IMPLEMENTATION-PLAN.md`** — engineering spec: schema, server actions, routes, SSE wiring, edge cases, and a suggested order of work. Both docs describe the same feature from different angles; cross-reference them.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, and copy. Recreate pixel-faithfully using the codebase's existing UI primitives (`@/components/ui/button`, `card`, `badge`, `player-card`, `section-label`, etc.). Where the prototype hand-rolled a primitive (e.g. inline `.btn` classes, the snake-order strip), port it to the closest existing component first; only add a new shadcn-style primitive in `src/components/ui/` if no existing one fits.

The visual language is already documented in `spicy-league/docs/DESIGN-SYSTEM.md` — that, plus `globals.css`, are the source of truth for tokens. The prototype's `colors_and_type.css` is a copy of those tokens for previewing the HTML offline.

---

## Screenshots

Reference images of every phase + variant live in `screenshots/`:

| File | Phase | Notes |
|---|---|---|
| `01-empty-state.png` | Empty (no active 10-man), admin view | Hero + 4-step explainer |
| `02-empty-state-history.png` | Same page, scrolled to history | Recent 10-mans list |
| `03-signup-slot-grid.png` | Signup — slot grid variant | Recommended |
| `04-signup-numbered-list.png` | Signup — numbered list variant | Lobby full state shown |
| `05-signup-progress-bar.png` | Signup — progress-bar variant | Visceral lobby-fill bar |
| `06-voting-tap-cards.png` | Captain vote — tap-cards variant | Recommended |
| `07-voting-ballot.png` | Captain vote — ballot variant | Sorted by vote count, live tally bars |
| `08-draft-live-board.png` | Draft — live-board variant | Recommended (direct port of season draft) |
| `09-draft-team-slots.png` | Draft — team-slots variant | Alternative w/ explicit slot placeholders |
| `10-teams-ready.png` | Ready phase | Side-by-side rosters + lobby code |
| `11-complete-winner.png` | Complete phase | Winner gets ★ Winners badge + accent border |

---

## Screens / Views

The whole flow lives under one URL: **`/10-man`**. State is driven by the active `tenMans` row's `state` field (server-rendered), and a Server-Sent Events stream keeps the page live during signup/voting/draft.

There are **six rendering states** of the page, plus a confirmation modal. Each is a separate phase component.

### 0. Top-bar nav addition (every page)

Add `10-man` to `navLinks` in `src/components/site-header-client.tsx`, between `History` and the admin link. Same styling as the existing links — active state shows the red underline.

Additionally, the **center live-pill** (currently surfaces an active season) should also surface an active 10-man when no season is live. Pill copy by phase:

- `10-MAN · {n}/10` — during signup
- `10-MAN · VOTING`
- `10-MAN · DRAFTING`
- `10-MAN · READY`

Pill href is always `/10-man`. Pulsing red dot stays the same as the season pill.

---

### 1. Empty state — `/10-man` with no active session

**Purpose:** Marketing/explainer + admin entry point. If an active 10-man exists, redirect to it; otherwise render this.

**Layout:**
- Page padding: matches the rest of the app (`.site-container`, `max-width: 1120px`).
- Top: hero block, left-aligned, `max-width: 720px`.
- Below hero: 4-column `01–04` step strip, separated from hero by a 1px top border.
- Below steps: **Recent 10-mans** list (only renders when there's history). Section label + count, then a list of full-width rows separated by 1px borders.

**Components:**

- **Section label** above hero — `10-MAN · PICKUP MATCH` in `--accent` red, `0.18em` letter-spacing, uppercase, 11px.
- **Headline** (h1) — "Got 10?" + line break + "Let's go." in `--accent`. `clamp(2.75rem, 7vw, 5.5rem)`, weight 500, `-0.035em` letter-spacing, `line-height: 1`.
- **Lede** — `font-size: 17`, `line-height: 1.7`, color `--muted`, `max-width: 56ch`. Copy: *"A one-off 5v5 for whoever's around. Sign up, vote on captains, draft from the pool, and play. The whole thing takes about 15 minutes — usually less."*
- **CTAs** — primary "Start a 10-man" (admin only; disabled with helper text for non-admins: *"Admins start the session — you'll get the join link."*) + ghost "How it works →". Pill-shaped via `rounded-full`.
- **Step strip** — 4 cards, `display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px`. Each: monospace number in accent (`01`, `02`, `03`, `04`), 16px title, 13px muted description.
  - 01 Signups — *"First 10 names lock the lobby."*
  - 02 Vote — *"Everyone picks 2 captains. Top 2 win."*
  - 03 Draft — *"Snake draft on the 8 remaining."*
  - 04 Play — *"Teams locked. Lobby up. Report the W."*
- **Recent 10-mans list** — each row is a flex container with: `#{id-suffix}` in mono muted, then a two-line block ("Team A def. Team B" + "{date} · {duration}"), then a "W" tag (accent), then a `→` arrow. Hover state: `background: var(--surface)`, padding-inline animates from 4 to 16px.

---

### 2. Signup phase — state `signups`

**Purpose:** Show who's in, let people join/leave, and once full, let the admin advance to voting.

**Layout (shared across variants):**
- **Phase banner** at top — full-width card. Left: section label "SIGNUPS OPEN" (or "LOBBY FULL"), large title `{n} of 10` (or "All 10 in."), sub-text. Middle: thin progress bar (max-width 240px, 4px tall, accent fill). Right: action buttons.
- Below banner: the signup roster, **one of three layouts** (build all three; let the user pick during dev review):

**Variant A — Slot grid** (default in the prototype):
- `display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px`.
- 10 cards total. Filled cards: avatar (40px circle, initials, surface bg, border), name + "joined Xm ago" stacked, then a 1px top border divider, then role tags + rank.
- Empty cards: dashed border, muted text "OPEN SLOT" + "#N of 10", min-height 116px.

**Variant B — Numbered list:**
- Single card containing 10 rows separated by 1px borders.
- Each filled row: `grid-template-columns: 32px 1fr auto auto auto`, gap 16, padding `12px 20px`. Mono `01`–`10` index, avatar + name, role tags, rank pill (Diamond II · 47 LP), joined-time.
- Empty rows: dashed top-border, italic muted "Waiting for player…", "OPEN" label, opacity 0.5.

**Variant C — Progress bar:**
- Big lobby-fill card. Inside: section label "LOBBY FILL", huge mono count `{n}/10` (28px, /10 muted).
- A 64px-tall bar: 10 columns separated by 1px borders. Filled columns show the avatar (32px). Empty columns show a muted index. Bar fills left-to-right with a faint accent gradient.
- Below the bar: compact roster cards in `auto-fit, minmax(200px, 1fr)` — avatar + name + role · rank.

**Buttons in the banner:**
- Non-admin, signups not full, not joined: "Join the 10-man" (primary).
- Non-admin, signups not full, joined: "Drop out" (outline, sm).
- Admin, signups not full: "Cancel session" (ghost, sm).
- Anyone, signups full + admin: "Open captain vote →" (primary, sm).

---

### 3. Captain voting phase — state `voting`

**Purpose:** Each of the 10 signups picks 2 of the 10 to become captain. Top 2 by vote-count win (ties broken at random). Live tally visible to everyone.

**Layout:**
- Phase banner top. Label "CAPTAIN VOTE", title `{n} of 10 voted`, sub *"Pick 2 — top 2 vote-getters become captains"*. Right: `Your votes 1/2` indicator. Admin sees "Start draft →" once 10/10 voted.
- Below: the ballot, **one of two variants**.

**Variant A — Ballot list:**
- Single card. 10 rows sorted by vote count descending. Each row is a button (entire row is the tap target):
  - Background **vote-share bar** behind the row, scaled by `(votes / maxVotes)`. Uses `position: absolute` + `transform-origin: left; transform: scaleX(...)` with `background: rgba(185, 28, 28, 0.08)`. Transitions on `transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)`.
  - Foreground: 20×20 checkbox (rounded 4px). Filled accent when voted, with a white checkmark SVG inside.
  - Avatar, then name (with "LEADING" tag in accent for top 2), then role + rank line.
  - Right: vote count (mono 16px) + " vote / votes" label, then position #N.

**Variant B — Tap-cards:**
- Grid of 10 cards, `repeat(auto-fit, minmax(220px, 1fr))`, gap 12.
- Each card: centered avatar (56px, accent border + accent letter color when voted), name, role tag, rank, a thin 3px vote-share bar at the bottom, and a footer line: *"✓ You voted"* (accent) or *"Tap to vote"* (muted).
- Corner pill in top-right shows the vote count. "LEADING" badge in top-left when votes ≥ 4.
- Voted state: `border: 1px solid var(--accent)`, `background: rgba(185, 28, 28, 0.06)`.

**Footer line below voting (both variants):**
> *"Waiting on N players to vote…"* on the left; *"Ties broken at random"* on the right. 13px muted.

**Vote selection mechanics:**
- Clicking a candidate when you've already voted 2 should replace your **oldest** vote, not refuse.
- Voting on someone you've already voted for un-votes them.

---

### 4. Draft phase — state `drafting`

**Purpose:** The 2 captains draft 4 each from the 8 remaining signups using snake order: `C1, C2, C2, C1, C1, C2, C2, C1`.

**Layout:**
- **Status banner** at top — card with two rows:
  - Top row: label "DRAFT · LIVE", title "Pick X of 8", "On the clock: {name}", and a contextual indicator on the right (admin sees "Admin override · You can pick for anyone"; the captain who's up sees the "Your pick" pill with a pulsing dot).
  - Bottom row: **snake-order strip** — 8 small cells (28×28, rounded 6px, mono `C1`/`C2`). Past picks are muted/filled-grey. Current pick is solid accent with a `pulseDot` animation. Future picks have just a thin border.
- Below: the draft board, **one of two variants**.

**Variant A — Live-board** (borrowed from `src/app/seasons/[slug]/draft/live-board.tsx`):
- `display: grid; grid-template-columns: 1fr 2fr; gap: 20px`.
- **Left column** — two team cards stacked. Each team card: mono "C1." / "C2." index + captain name in the header, "On clock" tag if applicable (accent), 1px divider, then an ordered list of picks. Each pick row: `#N` mono, 32px avatar, name, role tags. If team is on the clock, card border becomes `--accent`.
- **Right column** — one tall pool card. Header: "Available pool" + count. Filter input. Scrollable list (max-height 60vh) of remaining players. Each row: avatar, name, role tags, rank pill, and a "Pick" outline button if the viewer is on-the-clock or admin.

**Variant B — Team-slots:**
- `display: grid; grid-template-columns: 1fr 1fr; gap: 20`.
- Each team card has 5 explicit slots: 1 captain (accent-tinted, "C" prefix, CAPTAIN tag right-aligned) + 4 numbered slots (`P1` through `P4`). Filled slots show the player; empty slots show a dashed border with "Empty slot" placeholder and `—`.
- Last filled slot animates in via a `pickFlash` keyframe (accent bg fades to surface over 1.2s).
- An "● On the clock" pill floats at the top-left of the active captain's card (`position: absolute; top: -10`).
- Pool sits below at full width (spans both grid columns): `display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`.

**Pick log** (both variants) — card at the bottom with reverse-chronological list of picks: `#N` mono, captain name, "picks", picked player name, role tags compact.

**Pick permissions:**
- On-the-clock captain can pick from the pool.
- Admin can pick on behalf of any captain (override).
- Non-captains see no Pick buttons.

---

### 5. Teams ready — state `ready`

**Purpose:** Show the locked teams side-by-side. Admin reports the result here.

**Layout:**
- Phase banner: "TEAMS LOCKED" label, "Ready up" title, sub *"Lobby code below. Once the game's done, report the result."* Right: admin sees primary "Report result →"; non-admin sees muted *"Waiting for admin to report"*.
- **Teams grid**: `display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px`.
  - Left team card · VS divider · Right team card.
- **Team card layout:**
  - Header row: column with section label ("TEAM 1 · BLUE SIDE" / "TEAM 2 · RED SIDE") + 20px captain name + " & co." in muted; right: 36px circle side badge (`B` or `R`) on accent bg.
  - Roster: 5 rows. Row 1 is the captain (accent-tinted bg, "CAPTAIN" tag right). Rows 2–5 are the picks with the pick-number on the right (`#1`, `#4`, etc).
- **VS divider** — vertical, centered between teams. Two 60px vertical 1px lines stacked with a rounded `VS` pill in accent between them.
- **Lobby card** below the teams: section label "CUSTOM GAME LOBBY", helper text, then a mono lobby code pill (`SPCY-2487`) + "Copy" outline button on the right.

---

### 6. Result entry modal

**Purpose:** Admin reports the winner.

**Layout:**
- Fullscreen overlay: `position: fixed; inset: 0; background: rgba(0, 0, 0, 0.78); backdrop-filter: blur(6px)`.
- Centered card, 480px wide, 28px padding.
- Section label "REPORT RESULT", h2 "Who won?", helper *"This locks the 10-man and writes the W to history."*
- Two big choice buttons in a 2-col grid, one per captain: 40px captain avatar, "Team {name}", side-label below. Selected: accent border + tinted bg.
- Optional duration text input (`e.g. 34m`).
- Footer: ghost "Cancel" + primary "Submit result" (disabled until a winner is selected).

---

### 7. Complete phase — state `complete`

**Purpose:** Celebrate the winner, archive the session, and let the admin start another.

**Layout:**
- Hero block, centered, max-width 760px:
  - Section label "10-MAN · COMPLETE" in accent.
  - h1 `{winner-name}` (accent) + ` wins.` in one line. `clamp(2.25rem, 5vw, 3.75rem)`, weight 500, `whiteSpace: nowrap` to avoid wrapping.
  - 15px muted body line: *"{winner} def. {loser} in {duration}. The W is in the books — bragging rights granted for the rest of the night."*
- Teams grid (same as ready phase) but with winner/loser styling:
  - **Winner card**: `border: 1px solid var(--accent)`, faint accent bg, "★ WINNERS" pill floating at the top-right (`position: absolute; top: -12; right: 16`).
  - **Loser card**: `opacity: 0.55`.
- Footer card: "Want to run it back?" copy, plus "View in history" outline + admin-only "Start another 10-man" primary.

---

## Interactions & Behavior

### Phase transitions

| From       | Trigger                                                     | To         |
|------------|-------------------------------------------------------------|------------|
| (no row)   | Admin clicks "Start a 10-man"                               | `signups`  |
| `signups`  | 10th `joinSignup` action lands                              | `voting`   |
| `voting`   | 20th vote lands (10 voters × 2 votes); compute captains     | `drafting` |
| `drafting` | 8th `submitPick` action lands                               | `ready`    |
| `ready`    | Admin submits result via modal                              | `complete` |
| any        | Admin clicks Cancel (before `complete`)                     | `cancelled`|

All transitions are decided **server-side** in a single transaction with the action that triggers them. Clients re-render off the new snapshot, so the phase component swaps automatically.

### Live updates

`/10-man/[id]` subscribes to `EventSource('/api/ten-man/{id}/stream')` and rebinds the snapshot whenever an `update` event arrives. Reuse the SSE plumbing from `src/app/api/draft/[slug]/stream/route.ts`.

### Animations

The prototype's CSS transitions (Reveal entrance, fadeUp on pick rows) were disabled because the in-app iframe paused CSS transitions. In the real Next.js app, **re-enable** them:

- Section reveal: 700ms `cubic-bezier(0.16, 1, 0.3, 1)` opacity + 20px Y-translate.
- Pick-row entrance (team-slots variant): `pickFlash` keyframe — `background: rgba(185, 28, 28, 0.18) → var(--surface)` over 1200ms ease-out.
- Snake-order current cell: `pulseDot` — opacity 0.7 ↔ 1 over 1.6s ease-in-out infinite.
- Live dot: `ping` keyframe (scale 1 → 2.2, opacity 0.75 → 0) over 1.4s.

All animations respect `prefers-reduced-motion: reduce`.

### Hover states

- Primary buttons: `opacity: 0.82` on hover, `translateY(1px)` on active.
- Outline / ghost buttons: same.
- Nav links: opacity 0.5 → 1 on hover (matches existing header).
- Recent-10-mans rows: `background: var(--surface)`, `padding-inline: 4 → 16px` on hover.

---

## State Management

### Server-side state (Drizzle tables — see `IMPLEMENTATION-PLAN.md` §2 for full schemas):
- `tenMans` — one row per 10-man session
- `tenManSignups` — 10 rows max per session (`unique(tenManId, userId)`, `unique(tenManId, signupOrder)`)
- `tenManVotes` — up to 20 rows per session (`unique(tenManId, voterUserId, candidateUserId)`)
- `tenManCaptains` — exactly 2 rows once voting completes
- `tenManPicks` — exactly 8 rows once draft completes
- Result (winner + duration) lives on the `tenMans` row directly

### Derived state (in `src/lib/ten-man.ts`):
Phase is **not stored directly** — it's derived from row counts to keep things consistent. See `IMPLEMENTATION-PLAN.md` §3 for the derivation function.

### Client state (`live-board.tsx`):
- `snap: TenManSnapshot` — kept in sync via SSE
- `filter: string` — pool filter input (drafting phase)
- `yourVotes: string[]` — local optimistic state for the voting phase (server is source of truth; this just makes the UI feel snappy)

---

## Design Tokens

All tokens already exist in `spicy-league/src/app/globals.css`. Do not invent new ones.

```
--bg:          #0a0a0a
--surface:     #111111
--border:      #1f1f1f
--text:        #f5f0e8
--muted:       #6b6b6b
--accent:      #b91c1c   /* Tailwind red-700 */
--accent-fg:   #f5f0e8
```

**Spacing rhythm** (matches the rest of the app):
- xs `0.5rem`, sm `0.75rem`, md `1rem`, lg `1.5rem`, xl `2.5rem`, 2xl `4rem`, 3xl `6rem`

**Type:**
- Font: `--font-sans` (Geist Sans via `next/font/google`), mono uses `--font-mono` (Geist Mono).
- Sizes: 11px labels, 12px small/muted, 13–14px body, 16–17px lede, 20px subheadings, 22px team-name, `clamp(2.25rem, 5vw, 3.75rem)` for complete-hero, `clamp(2.75rem, 7vw, 5.5rem)` for empty-state hero.
- Headings: weight 500, letter-spacing `-0.025em` to `-0.035em`, line-height 1 to 1.05.
- Body: weight 400, line-height 1.65–1.7.
- Labels: weight 500, letter-spacing `0.1em` to `0.18em`, uppercase.

**Borders & radii:**
- All borders `1px solid var(--border)` unless emphasizing accent state.
- Card radius: 10px (`--radius`).
- Button radius: pill (`rounded-full`, `9999px`).
- Tag/pill radius: 4px or full.

**Shadows:** none used anywhere in this design. Cards differentiate by surface color + border.

---

## Authorization Rules

| Action                       | Who                                                  |
|------------------------------|------------------------------------------------------|
| Start a 10-man               | admin                                                |
| Cancel a 10-man              | admin (any phase before `complete`)                  |
| Join signups                 | any signed-in user, when state=`signups` & <10       |
| Leave signups                | self, when state=`signups`                           |
| Cast vote                    | one of the 10 signups, state=`voting`                |
| Submit pick                  | the on-the-clock captain, or admin override          |
| Report result                | admin, state=`ready`                                 |

---

## Assets

No new images, icons, or fonts. The whole feature uses:
- The existing flame logo (`LogoMark` in `src/components/ui/logo-mark.tsx`)
- Inline SVG checkmark for the ballot variant (12×12, stroked, in `accent-fg`)
- Initials-based avatar circles (no avatar images yet — matches the rest of the app)

If avatars get added later, slot them into the same `Avatar` primitive — the design accommodates real images at 32px / 40px / 56px sizes.

---

## Files

The prototype lives in `prototype/`:

- `index.html` — entry; loads React + Babel + all scripts
- `colors_and_type.css` — copy of the design system's tokens (for offline preview)
- `styles.css` — prototype-only styles (buttons, cards, badges, animations)
- `mock-data.jsx` — 10 mock players, vote tally, pick order, match history
- `ui.jsx` — shared UI: `SiteHeader`, `Avatar`, `RoleTags`, `RankPill`, `YourTurnBanner`, `SiteFooter`
- `phases-pre.jsx` — `PhaseEmpty`, `PhaseSignup`, `PhaseBanner`
- `phases-mid.jsx` — `PhaseVoting`, `PhaseDraft`, `SnakeOrderStrip`
- `phases-end.jsx` — `PhaseReady`, `PhaseComplete`, `ResultEntryModal`, `TeamRoster`, `VSDivider`
- `app.jsx` — phase router + Tweaks panel wiring
- `tweaks-panel.jsx` — in-design Tweaks panel (lets reviewers scrub through phases/variants; will not ship)

Open `prototype/index.html` directly in a browser. The Tweaks toggle (toolbar in the host app, or directly call `window.__setTweak('phase', 'voting')` from the console) cycles through every phase, variant, and viewer role (`admin` / `player` / `signed-out`).

For the full engineering plan — schema, migrations, server actions, SSE wiring, edge cases — see **`IMPLEMENTATION-PLAN.md`** in this folder.

---

## Open variant decisions

The prototype ships **three signup layouts**, **two voting layouts**, and **two draft layouts**. The codebase only needs one of each. Before implementing, pick:

- Signup: **Slot grid** (recommended — most lobby-like) · Numbered list · Progress bar
- Voting: **Tap-cards** (recommended — more visual energy) · Ballot list
- Draft: **Live-board** (recommended — direct port of the existing season draft) · Team-slots

If unsure, ship the recommended set first; the other variants are kept in the prototype as fallback designs to reference if user testing surfaces issues.
