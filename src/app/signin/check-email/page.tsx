import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SearchParams = Promise<{ type?: string }>;

export default async function CheckEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const { type } = await searchParams;
  const isReset = type === "reset";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            {isReset
              ? "We sent a password reset link to your inbox."
              : "We sent a verification link to your inbox. Click it to activate your account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Didn&apos;t get it? Check your spam folder, or{" "}
            {isReset ? (
              <Link href="/forgot-password" className="underline underline-offset-4">
                request a new link
              </Link>
            ) : (
              <Link href="/signup" className="underline underline-offset-4">
                try signing up again
              </Link>
            )}
            .
          </p>
          <Link href="/signin" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
