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
in `src/auth.ts`. `src/auth.ts` lowercase-safe-casts the custom user fields
and collapses the shape so the rest of the app uses a clean `AppSession`
with `{ id, email, displayName, role }`.

## Session shape

From `src/auth.ts`:

```ts
type AppSession = {
  user: {
    id: string;
    email: string;
    displayName: string | null;   // null until onboarded
    role: "user" | "admin";        // DB default: "user"
  };
};
```

The Better Auth user record also carries `bio`, `pronouns`, `opggUrl` (see
`user.additionalFields` in `src/lib/auth.ts`), but those are **not** on the
session payload — query the `users` table when you need them. `input: false`
on those fields means clients cannot set them via Better Auth's auto-generated
endpoints; we mutate them through our own server actions (see
`src/app/profile/page.tsx`).

## Guards

All in `src/lib/auth-helpers.ts`. Every guard `redirect`s on failure, so the
function never returns a bad session.

| Guard | Succeeds when | Redirects to |
|---|---|---|
| `getSession()` | always (returns null) | — |
| `requireAuth(redirectTo = "/signin")` | signed in | `/signin` |
| `requireAdmin()` | signed in AND `role === "admin"` | `/` if not admin, `/signin` if not auth'd |
| `requireOnboarded()` | signed in AND `displayName !== null` | `/onboarding` |

**Admin check pattern**: every admin server action calls `requireAdmin()`
first. Grep `requireAdmin\(\)` to find the admin-gated surface — currently
everything under `src/app/admin/**/actions.ts` and some pieces of
`src/app/seasons/[slug]/draft/actions.ts` (`startDraft`, `pauseDraft`,
`resumeDraft`, `undoLastPick`).

**Onboarded check pattern**: user-facing mutations use `requireOnboarded()`
so we never have a team member with a null display name. See
`submitSignup`, `submitPick`, `reportMatch`.

## Onboarding

- New user signs up → Better Auth sends verification email via Resend
  (`sendVerificationEmail` in `src/lib/auth.ts`).
- On first authenticated request, `session.user.displayName` is `null`.
- Any page wrapped in `requireOnboarded()` redirects them to `/onboarding`.
- `/onboarding` accepts a 3–24 char `[a-zA-Z0-9_-]` string, lowercases it,
  checks for conflict, writes to `users.display_name`.
- Display name is treated as **permanent** — there is no change-name flow
  on `/profile`.

The regex is `/^[a-zA-Z0-9_-]{3,24}$/` (see `DISPLAY_NAME_PATTERN` in
`src/app/onboarding/page.tsx`). On the server we lowercase before the
uniqueness check and the write.

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
Auth auto-detects from request host (correct on Vercel). Set at least one
when running behind a custom domain. See [ENV.md](ENV.md).

## Where to look when…

- …a user hits `/onboarding` in a loop → their displayName write failed
  silently OR the session cookie cache is serving stale nulls. Check
  `session.cookieCache.maxAge` and the `users` row directly.
- …an email isn't sending → `AUTH_RESEND_KEY` unset, or the `from` address
  (`AUTH_EMAIL_FROM`, default `no-reply@spicyleague.dev`) isn't on a
  verified Resend domain.
- …a server action redirects to `/signin` unexpectedly → it's calling
  `requireAuth` and the session is missing. Check cookies in devtools and
  confirm `sl.session_token` is present.
- …admin check fails → confirm `users.role = 'admin'` at DB level, then
  sign out + sign back in so the session cookie refreshes.
