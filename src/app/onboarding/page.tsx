import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const DISPLAY_NAME_PATTERN = /^[a-zA-Z0-9_-]{3,24}$/;

type SearchParams = Promise<{ error?: string }>;

export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAuth();
  const { error } = await searchParams;

  if (session.user.displayName) {
    redirect("/profile");
  }

  async function setDisplayName(formData: FormData) {
    "use server";
    const raw = formData.get("displayName");
    if (typeof raw !== "string" || !DISPLAY_NAME_PATTERN.test(raw)) {
      redirect("/onboarding?error=invalid");
    }
    const normalized = raw.toLowerCase();
    const session = await requireAuth();

    const existing = await db.query.users.findFirst({
      where: eq(users.displayName, normalized),
    });
    if (existing && existing.id !== session.user.id) {
      redirect("/onboarding?error=taken");
    }

    await db
      .update(users)
      .set({ displayName: normalized, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));

    redirect("/profile");
  }

  const errorMessage =
    error === "taken"
      ? "That display name is already taken."
      : error === "invalid"
        ? "Use 3–24 characters: letters, numbers, underscore, or hyphen."
        : null;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Pick a display name</CardTitle>
          <CardDescription>
            This is how teammates and captains will see you across Spicy League. You can&apos;t
            change it once picked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <form action={setDisplayName} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                name="displayName"
                placeholder="spicy_caleb"
                pattern="[a-zA-Z0-9_-]{3,24}"
                minLength={3}
                maxLength={24}
                required
              />
              <p className="text-muted-foreground text-xs">
                3–24 characters. Letters, numbers, underscore, hyphen.
              </p>
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
