import { and, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import { submitSignup } from "./actions";
import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { seasonSignups } from "@/db/schema/seasons";
import { auth } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LocalTime } from "@/components/ui/local-time";
import { Textarea } from "@/components/ui/textarea";
import { seasonPageMetadata } from "@/lib/season-meta";
import { GAME_LABELS, SIGNUP_QUANDARY, openSignupKind } from "@/lib/seasons";
import { missingSignupRequirements } from "@/lib/signup-gate";
import { signInHref } from "@/lib/safe-redirect";

export const generateMetadata = seasonPageMetadata("Sign up");

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ error?: string }>;

export const dynamic = "force-dynamic";

const LOL_ROLES = [
  { value: "top", label: "Top" },
  { value: "jungle", label: "Jungle" },
  { value: "mid", label: "Mid" },
  { value: "adc", label: "ADC" },
  { value: "support", label: "Support" },
  { value: "fill", label: "Fill" },
] as const;

const CS2_MAPS = [
  { value: "dust2", label: "Dust II" },
  { value: "mirage", label: "Mirage" },
  { value: "inferno", label: "Inferno" },
  { value: "nuke", label: "Nuke" },
  { value: "overpass", label: "Overpass" },
  { value: "anubis", label: "Anubis" },
  { value: "ancient", label: "Ancient" },
] as const;

const SIGNUP_KINDS = [
  {
    value: "player",
    label: "Play in the draft",
    description: "Captains can draft you onto a team for the whole season.",
  },
  {
    value: "sub",
    label: "Sub only",
    description:
      "You won't be drafted. Once teams are set, captains see you on the available subs list and can request you for a match.",
  },
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Some fields are invalid. Please check your selections.",
  quandary: "Answer the moral quandary to sign up.",
};

const selectClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const season = await db.query.seasons.findFirst({
    where: and(eq(seasons.slug, slug), ne(seasons.state, "draft")),
  });
  if (!season) notFound();

  const now = new Date();
  // "player" during the signup window (the form also offers sub-only), "sub"
  // after it, null otherwise.
  const kind = openSignupKind(season, now);
  const isOpen = kind !== null;
  const isSub = kind === "sub";

  const session = await auth();
  const alreadySignedUp = session?.user?.id
    ? !!(await db.query.seasonSignups.findFirst({
        where: and(
          eq(seasonSignups.seasonId, season.id),
          eq(seasonSignups.userId, session.user.id),
        ),
      }))
    : false;

  const action = submitSignup.bind(null, slug);
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  if (!session?.user) {
    return (
      <div className="page flex-1 [--page-max:36rem]">
        <Alert>
          <AlertDescription>
            You need to{" "}
            <Link
              href={signInHref(`/seasons/${slug}/signup`)}
              className="underline underline-offset-2"
            >
              sign in
            </Link>{" "}
            before signing up.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!session.user.username) {
    return (
      <div className="page flex-1 [--page-max:36rem]">
        <Alert>
          <AlertDescription>
            You need to{" "}
            <Link href="/signup" className="underline underline-offset-2">
              complete your account setup
            </Link>{" "}
            before signing up.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (alreadySignedUp) {
    return (
      <div className="page flex-1 space-y-4 [--page-max:36rem]">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← Back to season
        </Link>
        <Alert>
          <AlertDescription>You&apos;re already signed up for {season.name}.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const missing = isOpen
    ? await missingSignupRequirements(session.user.id, season.game)
    : { discord: false, riot: false };
  if (missing.discord || missing.riot) {
    return (
      <div className="page flex-1 space-y-4 [--page-max:36rem]">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← Back to season
        </Link>
        <Alert>
          <AlertDescription className="space-y-2">
            <p>Before signing up for {season.name}, add these on your profile:</p>
            <ul className="list-disc space-y-1 pl-5">
              {missing.discord ? (
                <li>Your Discord username, so admins and captains can reach you.</li>
              ) : null}
              {missing.riot ? (
                <li>A linked Riot account. Captains use your rank and OP.GG to scout the draft.</li>
              ) : null}
            </ul>
            <p>
              <Link href="/profile" className="underline underline-offset-2">
                Go to your profile
              </Link>
              , then come back here.
            </p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="page flex-1 space-y-4 [--page-max:36rem]">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← Back to season
        </Link>
        <Alert>
          <AlertDescription>
            {season.state === "complete" ? (
              "This season is over."
            ) : season.signupOpensAt && now < season.signupOpensAt ? (
              <>
                Signups open <LocalTime date={season.signupOpensAt} />.
              </>
            ) : season.signupClosesAt && now > season.signupClosesAt ? (
              <>
                Signups closed <LocalTime date={season.signupClosesAt} />.
              </>
            ) : (
              "Signups are not currently open."
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="page flex-1 space-y-6 [--page-max:36rem]">
      <header className="space-y-1">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← Back to season
        </Link>
        <h1 className="text-heading">{isSub ? "Sign up as a sub" : "Sign up"}</h1>
        <p className="text-muted-foreground text-sm">
          {season.name} · {GAME_LABELS[season.game]}
        </p>
        {isSub ? (
          <p className="text-muted-foreground text-sm">
            Regular signups have closed, so you won&apos;t be drafted. Captains will see you on the
            available subs list and can request you for a match; an admin approves each sub.
          </p>
        ) : null}
      </header>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-5">
            {isSub ? null : (
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">How do you want to play?</legend>
                {SIGNUP_KINDS.map((k) => (
                  <label
                    key={k.value}
                    className="has-checked:border-ring flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={k.value}
                      defaultChecked={k.value === "player"}
                      className="mt-0.5"
                    />
                    <span className="space-y-0.5">
                      <span className="block font-medium">{k.label}</span>
                      <span className="text-muted-foreground block text-xs">{k.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {season.game === "lol" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="primaryRole">Primary role</Label>
                  <select
                    id="primaryRole"
                    name="primaryRole"
                    required
                    defaultValue=""
                    className={selectClass}
                  >
                    <option value="" disabled>
                      Choose a role…
                    </option>
                    {LOL_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="secondaryRole">Secondary role</Label>
                  <select
                    id="secondaryRole"
                    name="secondaryRole"
                    required
                    defaultValue="fill"
                    className={selectClass}
                  >
                    {LOL_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>Map preferences</Label>
                <p className="text-muted-foreground text-xs">
                  Select all maps you&apos;re comfortable playing.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CS2_MAPS.map((m) => (
                    <label key={m.value} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="mapPrefs" value={m.value} className="rounded" />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Notes <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="notes"
                name="notes"
                maxLength={500}
                rows={3}
                placeholder={
                  isSub
                    ? "When are you usually free to sub? Captains see this."
                    : "Anything captains should know about your schedule or availability…"
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quandary">Moral quandary</Label>
              <p className="text-muted-foreground text-xs">{SIGNUP_QUANDARY}</p>
              <Textarea
                id="quandary"
                name="quandary"
                required
                maxLength={500}
                rows={3}
                placeholder="Yes or no, and why…"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Link
                href={`/seasons/${slug}`}
                className="text-muted-foreground self-center text-sm hover:underline"
              >
                Cancel
              </Link>
              <PendingSubmitButton>
                {isSub ? "Join the sub list" : "Submit signup"}
              </PendingSubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
