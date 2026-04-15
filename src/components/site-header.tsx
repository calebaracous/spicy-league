import Link from "next/link";

import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="border-border/60 border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-primary">🌶</span>
          <span>Spicy League</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/seasons"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Seasons
          </Link>
          {user?.role === "admin" ? (
            <Link
              href="/admin"
              className="text-muted-foreground hover:text-foreground ml-3 transition-colors"
            >
              Admin
            </Link>
          ) : null}
          {user ? (
            <Link href="/profile" className={cn(buttonVariants({ size: "sm" }), "ml-3")}>
              {user.displayName ?? "Profile"}
            </Link>
          ) : (
            <Link
              href="/signin"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "ml-3")}
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
