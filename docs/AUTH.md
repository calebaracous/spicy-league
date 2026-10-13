# Authentication

Shipped with **Better Auth** (`better-auth@^1.6.5`) + Drizzle adapter +
Resend email. **Not** NextAuth, despite what [PLANNING.md](../PLANNING.md)
says. Users **sign in with username + password** (email is only used for
verification and password reset). Email verification is required before
first sign-in.

## The three `auth` surfaces

There are three things named "auth" — know which one to import.

| Import | Purpose | Surface |
|---|---|---|
| `import { auth } from "@/lib/auth"` | Better Auth instance itself | Server only. Used by the auth route handler and by `src/auth.ts`. |
| `import { auth } from "@/auth"` | App wrapper that returns `AppSession \| null` | Server components, pages. Normalizes the session shape. |
| `import { authClient } from "@/lib/auth-client"` + `signIn`, `signUp`, `signOut`, `useSession` | React client SDK | Client components (`"use client"`). Calls `/api/auth/*` under the hood. Currently used by the forgot/reset-password forms; sign-in and sign-up go through server actions instead. |

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
`input: false` and mutated via the inline `saveProfile` action in
`src/app/profile/page.tsx`.

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
everything under `src/app/admin/**/actions.ts`, `startDraft` / `pauseDraft` /
`resumeDraft` / `undoLastPick` in `src/app/seasons/[slug]/draft/actions.ts`,
`confirmMatch` / `disputeMatch` / `resetMatch` in
`src/app/seasons/[slug]/matches/actions.ts`, and `start10Man` /
`cancel10Man` / `reportResult` in `src/app/10-man/actions.ts`.

**Onboarded check pattern**: season and profile mutations use
`requireOnboarded()` so we never have a team member with a null username.
See `submitSignup`, `submitPick`, `reportMatch`, and everything in
`src/app/profile/account-actions.ts`. 10-man actions only use
`requireAuth()`.

## Sign-in flow

- `/signin` renders `SignInForm` (client) with **username**, password, and a
  "remember me" checkbox.
- On submit it calls the `signInWithUsername` server action in
  `src/app/signin/actions.ts`:
  1. Validates the username against `/^[a-zA-Z0-9_-]{3,24}$/` and lowercases it.
  2. Looks up the user's email by username.
  3. Calls `auth.api.signInEmail({ body: { email, password, rememberMe }, headers })`.
     The `nextCookies()` plugin in `src/lib/auth.ts` is what makes the
     `Set-Cookie` from this server-side call land on the response — without
     it, server-action sign-in silently produces no session.
  4. Returns `{ ok: true }` or `{ error }`. Unknown user and bad password
     both return the same generic message. `EMAIL_NOT_VERIFIED` maps to a
     "verify your email" message.
- On `ok`, the client does `router.push(callbackUrl ?? "/profile")` +
  `router.refresh()`.

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

- **Cookies** (prefix `sl` from `advanced.cookiePrefix` in
  `src/lib/auth.ts`; on HTTPS Better Auth prepends `__Secure-`, so prod
  names are `__Secure-sl.*`):
  - `sl.session_token` — the session token.
  - `sl.session_data` — signed cookie cache of the session (see below).
  - `sl.dont_remember` — only when signed in with "remember me" unchecked.
  `sl.account_data` is not used (`account.storeAccountCookie` is off).
  These are listed in the Privacy Policy (`src/app/privacy/page.tsx`) —
  update it if this set changes.
- **Sign-out**: `doSignOut` in `src/app/profile/page.tsx` calls Better
  Auth's `signOut`, which clears the cookies via `nextCookies()`. Its extra
  `cookies().delete("sl.session_token")` only matches the unprefixed dev
  name; it's a harmless no-op in production.
- **Session expiry**: `expiresIn` = 30 days, `updateAge` = 1 day (rolling:
  an active session is pushed out to 30 days once it's a day old).
- **Remember me** (checkbox on `/signin`, "Stay signed in for 30 days"):
  Better Auth has no separate long-lived duration, so `expiresIn` *is*
  the remember-me duration. Checked → persistent cookie with
  `maxAge = expiresIn` (30 days, rolling). Unchecked → browser-session
  cookie, not refreshed, and Better Auth caps the DB session at 1 day.
  Email-verification auto sign-in uses the remembered (30-day) path.
- **Cookie cache**: `cookieCache` (5 minutes) stores the session in the
  signed `sl.session_data` cookie so most requests skip the Postgres
  session lookup — configured in `src/lib/auth.ts`.

## Routing

- `/api/auth/[...all]/route.ts` mounts Better Auth's handler via
  `toNextJsHandler(auth)`. All sign-in, sign-up, verification, and
  reset-password requests flow through here.
- `/api/auth/[...nextauth]/` may still exist on disk as an **empty,
  untracked directory** — historical remnant from the Auth.js plan. It's
  not in git; ignore or delete it.

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
- …sign-in "succeeds" but the user isn't signed in → confirm `nextCookies()`
  is still last in `plugins` in `src/lib/auth.ts`.
- …a user can't sign in with their email → by design; sign-in is username-only.
- …an email isn't sending → `AUTH_RESEND_KEY` unset, or the `from` address
  (`AUTH_EMAIL_FROM`, default `no-reply@spicyleague.dev`) isn't on a
  verified Resend domain.
- …a server action redirects to `/signin` unexpectedly → it's calling
  `requireAuth` and the session is missing. Check cookies in devtools and
  confirm `sl.session_token` (`__Secure-sl.session_token` in prod) is present.
- …admin check fails → confirm `users.role = 'admin'` at DB level, then
  sign out + sign back in so the session cookie refreshes.
