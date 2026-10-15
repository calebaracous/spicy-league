import { redirect } from "next/navigation";

import { SignInForm } from "./_components/sign-in-form";
import { auth } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeCallbackUrl } from "@/lib/safe-redirect";

export const metadata = { title: "Sign in" };

type SearchParams = Promise<{ callbackUrl?: string; reset?: string }>;

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { callbackUrl: rawCallbackUrl, reset } = await searchParams;
  const callbackUrl = safeCallbackUrl(rawCallbackUrl);

  const session = await auth();
  if (session) redirect(callbackUrl);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">
            <h1>Sign in to Spicy League</h1>
          </CardTitle>
          <CardDescription>Enter your username and password.</CardDescription>
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
    </div>
  );
}
