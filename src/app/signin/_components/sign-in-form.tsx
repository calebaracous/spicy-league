"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { signInWithUsername } from "@/app/signin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    setError(null);
    startTransition(async () => {
      const result = await signInWithUsername(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(callbackUrl ?? "/profile");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          placeholder="spicy_caleb"
          pattern="[a-zA-Z0-9_\-]{3,24}"
          minLength={3}
          maxLength={24}
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="rememberMe"
          name="rememberMe"
          type="checkbox"
          className="accent-secondary h-4 w-4 rounded"
          disabled={isPending}
        />
        <Label htmlFor="rememberMe" className="cursor-pointer font-normal">
          Stay signed in for 30 days
        </Label>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-foreground underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </form>
  );
}
