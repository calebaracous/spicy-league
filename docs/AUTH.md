# Authentication

Shipped with **Better Auth** (`better-auth@^1.6.5`) + Drizzle adapter +
Resend email. **Not** NextAuth, despite what [PLANNING.md](../PLANNING.md)
says. Email + password, with required email verification.

## The three `auth` surfaces

There are three things named "auth" — know which one to import.

| Import | Purpose | Surface |
|---|---|---|
| `import { auth } from "@/lib/auth"` | Better Auth instance itself | Server only. Used by the auth route handler and by `src/auth.ts`. |
| `import { auth } from "@/auth"` | App wrapper that returns `AppSession \| null` | Server components, pages. Normalizes the session shape. |
| `import { authClient } from "@/lib/auth-client"` + `signIn`, `signUp`, `signOut`, `useSession` | React client SDK | Client components (`"use client"`). Calls `/api/auth/*` under the hood. |

Both server paths ultimately delegate to `betterAuth.api.getSession({ headers })`
in `src/auth.ts`. `src/auth.ts` safe-casts the custom user fields
and collapses the shape so the rest of the app uses a clean `AppSession`.

## Session shape

From `src/auth.ts`:

```ts
type AppSession = {
  user: {
    id: string;
    email: string;
    username: string | null;  // immutable, set at signup, used as URL slug
    name: string | null;      // editable display name (defaults to username)
    role: "user" | "admin";   // DB default: "user"
  };
};
```

The Better Auth user record also carries `bio`, `pronouns`, `opggUrl` (see
`user.additionalFields` in `src/lib/auth.ts`), but those are **not** on the
session payload — query the `users` table when you need them. `input: false`
on `username` means clients cannot set it via Better Auth's auto-generated
endpoints; we write it from our own signup server action (see
`src/app/signup/actions.ts`). `bio`, `pronouns`, `opggUrl` are also
`input: false` and mutated via `src/app/profile/page.tsx`.

## Username vs display name

- **`username`** (`users.username`, DB column `username`) — immutable, set at
  signup via `/signup`, used as the public URL slug at `/users/{username}`.
  Regex: `/^[a-zA-Z0-9_-]{3,24}$/`, lowercased before write.
- **`name`** (`users.name`, Better Auth standard field) — editable display name
  shown in draft lists, team rosters, captains page, etc. Defaults to the
  username at signup. Editable on `/profile`. Constraints: 1–50 chars, trimmed.

In UI layers that need a single display string, use the COALESCE pattern:
`COALESCE(users.name, users.username, '?')`. The `DraftSnapshot` type surfaces
this as `displayName` throughout the draft system.

## Guards

All in `src/lib/auth-helpers.ts`. Every guard `redirect`s on failure, so the
function never returns a bad session.

| Guard | Succeeds when | Redirects to |
|---|---|---|
| `getSession()` | always (returns null) | — |
| `requireAuth(redirectTo = "/signin")` | signed in | `/signin` |
| `requireAdmin()` | signed in AND `role === "admin"` | `/` if not admin, `/signin` if not auth'd |
| `requireOnboarded()` | signed in AND `username !== null` | `/signin` |

**Admin check pattern**: every admin server action calls `requireAdmin()`
first. Grep `requireAdmin\(\)` to find the admin-gated surface — currently
everything under `src/app/admin/**/actions.ts` and some pieces of
`src/app/seasons/[slug]/draft/actions.ts` (`startDraft`, `pauseDraft`,
`resumeDraft`, `undoLastPick`).

**Onboarded check pattern**: user-facing mutations use `requireOnboarded()`
so we never have a team member with a null username. See
`submitSignup`, `submitPick`, `reportMatch`.

## Signup flow

- User fills out `/signup` form with email, username, password, confirm password.
- `registerUser` server action in `src/app/signup/actions.ts`:
  1. Validates passwords match and meet length requirement.
  2. Validates `username` matches `[a-zA-Z0-9_-]{3,24}`, lowercases it.
  3. Checks DB uniqueness against `users.username`.
  4. Calls `auth.api.signUpEmail({ body: { email, password, name: username } })`
     to create the Better Auth user (sets `name` = username as default display name).
  5. Writes `username` to `users.username` via Drizzle.
  6. Redirects to `/signin/check-email?type=verify`.
- Better Auth sends verification email via Resend on signup.
- There is no `/onboarding` page — username is captured during signup.

## Cookies + sessions

- **Cookie prefix**: `sl` (from `advanced.cookiePrefix` in
  `src/lib/auth.ts`). The session cookie name is therefore
  `sl.session_token` — that's the one we `cookies().delete()` on sign-out in
  `src/app/profile/page.tsx`.
- **Session expiry**: 1 day default, updated every 12 hours. rememberMe on
  signIn can extend to 30 days (not currently wired in UI).
- **Cookie cache**: 5-minute in-memory cache on the session cookie so we're
  not hitting Postgres on every request — configured in `src/lib/auth.ts`.

## Routing

- `/api/auth/[...all]/route.ts` mounts Better Auth's handler via
  `toNextJsHandler(auth)`. All sign-in, sign-up, verification, and
  reset-password requests flow through here.
- `/api/auth/[...nextauth]/` is an **empty stub directory** — historical
  remnant from the Auth.js plan. Ignore it.

## Admin promotion

There is no UI for granting admin. `users.role` is a Postgres enum
(`user_role` = `user | admin`). Promote manually:

```sql
UPDATE users SET role = 'admin' WHERE email = 'me@example.com';
```

## Base URL and trusted origins

`src/lib/auth.ts` reads `BETTER_AUTH_URL ?? NEXT_PUBLIC_APP_URL` for
`baseURL` and sends both into `trustedOrigins`. If neither is set, Better
Auth auto-detects from request host (correct on Vercel). The production
canonical URL is `https://www.spicyleague.dev` — both env vars must use
the `www` form or Better Auth rejects requests from the apex domain.
See [ENV.md](ENV.md).

## Where to look when…

- …a user cannot sign up → check `users.username` uniqueness in DB, or see
  if the validation regex rejects their chosen username.
- …an email isn't sending → `AUTH_RESEND_KEY` unset, or the `from` address
  (`AUTH_EMAIL_FROM`, default `no-reply@spicyleague.dev`) isn't on a
  verified Resend domain.
- …a server action redirects to `/signin` unexpectedly → it's calling
  `requireAuth` and the session is missing. Check cookies in devtools and
  confirm `sl.session_token` is present.
- …admin check fails → confirm `users.role = 'admin'` at DB level, then
  sign out + sign back in so the session cookie refreshes.
