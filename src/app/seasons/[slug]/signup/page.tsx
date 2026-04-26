import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import { submitSignup } from "./actions";
import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { seasonSignups } from "@/db/schema/seasons";
import { auth } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GAME_LABELS } from "@/lib/seasons";

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

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Some fields are invalid. Please check your selections.",
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
    where: and(eq(seasons.slug, slug), eq(seasons.state, "signups_open")),
  });
  if (!season) notFound();

  const now = new Date();
  const isOpen =
    (!season.signupOpensAt || now >= season.signupOpensAt) &&
    (!season.signupClosesAt || now <= season.signupClosesAt);

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
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
        <Alert>
          <AlertDescription>
            You need to{" "}
            <Link
              href={`/signin?callbackUrl=/seasons/${slug}/signup`}
              className="underline underline-offset-2"
            >
              sign in
            </Link>{" "}
            before signing up.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (!session.user.username) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
        <Alert>
          <AlertDescription>
            You need to{" "}
            <Link href="/signup" className="underline underline-offset-2">
              complete your account setup
            </Link>{" "}
            before signing up.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (alreadySignedUp) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-6 py-12">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← Back to season
        </Link>
        <Alert>
          <AlertDescription>You&apos;re already signed up for {season.name}.</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (!isOpen) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-6 py-12">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← Back to season
        </Link>
        <Alert>
          <AlertDescription>Signups are not currently open.</AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-6 px-6 py-12">
      <header className="space-y-1">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← Back to season
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Sign up</h1>
        <p className="text-muted-foreground text-sm">
          {season.name} · {GAME_LABELS[season.game]}
        </p>
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
            {season.game === "lol" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="primaryRole">Primary role</Label>
                  <select id="primaryRole" name="primaryRole" required className={selectClass}>
                    {LOL_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="secondaryRole">Secondary role</Label>
                  <select id="secondaryRole" name="secondaryRole" required className={selectClass}>
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
                placeholder="Anything captains should know about your schedule or availability…"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Link
                href={`/seasons/${slug}`}
                className="text-muted-foreground self-center text-sm hover:underline"
              >
                Cancel
              </Link>
              <Button type="submit">Submit signup</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
