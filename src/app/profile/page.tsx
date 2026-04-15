import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { signOut } from "@/auth";
import { requireOnboarded } from "@/lib/auth-helpers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type SearchParams = Promise<{ saved?: string; error?: string }>;

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireOnboarded();
  const { saved, error } = await searchParams;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!user) redirect("/signin");

  async function saveProfile(formData: FormData) {
    "use server";
    const session = await requireOnboarded();
    const bio = (formData.get("bio") ?? "").toString().slice(0, 500) || null;
    const pronouns = (formData.get("pronouns") ?? "").toString().slice(0, 40) || null;
    const opggUrlRaw = (formData.get("opggUrl") ?? "").toString().trim() || null;

    if (opggUrlRaw) {
      try {
        const url = new URL(opggUrlRaw);
        if (!url.hostname.includes("op.gg")) {
          redirect("/profile?error=opgg-host");
        }
      } catch {
        redirect("/profile?error=opgg-url");
      }
    }

    await db
      .update(users)
      .set({ bio, pronouns, opggUrl: opggUrlRaw, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));

    redirect("/profile?saved=1");
  }

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const errorMessage =
    error === "opgg-host"
      ? "The OP.GG link must point to op.gg."
      : error === "opgg-url"
        ? "That doesn't look like a valid URL."
        : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as <span className="font-medium">{user.email}</span>
          </p>
        </div>
        <form action={doSignOut}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </header>
      <Separator />
      <Card>
        <CardHeader>
          <CardTitle>Public profile</CardTitle>
          <CardDescription>
            Everyone in the league can see this information. Your display name{" "}
            <span className="font-mono">{user.displayName}</span> is permanent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {saved ? (
            <Alert>
              <AlertDescription>Profile saved.</AlertDescription>
            </Alert>
          ) : null}
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <form action={saveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pronouns">Pronouns</Label>
              <Input
                id="pronouns"
                name="pronouns"
                defaultValue={user.pronouns ?? ""}
                maxLength={40}
                placeholder="they/them"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                defaultValue={user.bio ?? ""}
                maxLength={500}
                rows={4}
                placeholder="A short blurb for your public page."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opggUrl">OP.GG URL</Label>
              <Input
                id="opggUrl"
                name="opggUrl"
                type="url"
                defaultValue={user.opggUrl ?? ""}
                placeholder="https://op.gg/summoners/na/YourName-NA1"
              />
            </div>
            <div className="flex justify-between">
              <Link
                href={`/u/${user.displayName}`}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                View public page
              </Link>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
