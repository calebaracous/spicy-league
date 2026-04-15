import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";

type SearchParams = Promise<{ callbackUrl?: string; error?: string }>;

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { callbackUrl, error } = await searchParams;

  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = formData.get("email");
    if (typeof email !== "string" || !email) {
      redirect("/signin?error=invalid-email");
    }
    const normalized = email.trim().toLowerCase();
    const rl = await checkRateLimit(rateLimits.magicLink, normalized);
    if (!rl.success) {
      redirect("/signin?error=rate-limited");
    }
    try {
      await signIn("resend", {
        email: normalized,
        redirectTo: callbackUrl ?? "/profile",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/signin?error=${encodeURIComponent(err.type)}`);
      }
      throw err;
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to Spicy League</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a magic link to sign in. No password needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {error === "rate-limited"
                  ? "Too many magic link requests. Try again in an hour."
                  : "Something went wrong sending the magic link. Try again in a moment."}
              </AlertDescription>
            </Alert>
          ) : null}
          <form action={sendMagicLink} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Send magic link
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
