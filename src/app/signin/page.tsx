import { redirect } from "next/navigation";

import { SignInForm } from "./_components/sign-in-form";
import { auth } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SearchParams = Promise<{ callbackUrl?: string; reset?: string }>;

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (session) redirect("/profile");

  const { callbackUrl, reset } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to Spicy League</CardTitle>
          <CardDescription>Enter your email and password to continue.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reset ? (
            <Alert>
              <AlertDescription>Password updated. Sign in with your new password.</AlertDescription>
            </Alert>
          ) : null}
          <SignInForm callbackUrl={callbackUrl} />
        </CardContent>
      </Card>
    </main>
  );
}
