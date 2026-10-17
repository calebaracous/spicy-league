import { MailWarningIcon } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Check your email" };

type SearchParams = Promise<{ type?: string }>;

export default async function CheckEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const { type } = await searchParams;
  const isReset = type === "reset";

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">
            <h1>Check your email</h1>
          </CardTitle>
          <CardDescription>
            {isReset
              ? "We sent a password reset link to your inbox."
              : "We sent a verification link to your inbox. Click it to activate your account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <MailWarningIcon className="text-amber-600 dark:text-amber-400" />
            <AlertTitle>Don&apos;t see it? Check your spam or junk folder.</AlertTitle>
            <AlertDescription>
              Our emails sometimes get filtered there. If you find it, mark it as &quot;Not
              spam&quot; so future emails reach your inbox.
            </AlertDescription>
          </Alert>
          <p className="text-muted-foreground">
            Still nothing after a few minutes?{" "}
            {isReset ? (
              <Link href="/forgot-password" className="underline underline-offset-4">
                Request a new link
              </Link>
            ) : (
              <Link href="/signup" className="underline underline-offset-4">
                Try signing up again
              </Link>
            )}
            .
          </p>
          <Link href="/signin" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
