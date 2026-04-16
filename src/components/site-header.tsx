import Link from "next/link";

import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";


export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="bg-primary border-b border-primary-foreground/10">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-primary-foreground"
        >
          <span>🌶</span>
          <span>Spicy League</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/seasons"
            className="text-primary-foreground/70 hover:text-primary-foreground transition-colors"
          >
            Seasons
          </Link>
          {user?.role === "admin" ? (
            <Link
              href="/admin"
              className="text-primary-foreground/70 hover:text-primary-foreground ml-3 transition-colors"
            >
              Admin
            </Link>
          ) : null}
          {user ? (
            <Link
              href="/profile"
              className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "ml-3")}
            >
              {user.displayName ?? "Profile"}
            </Link>
          ) : (
            <Link
              href="/signin"
              className={cn(
                buttonVariants({ size: "sm" }),
                "ml-3 bg-primary-foreground text-primary hover:bg-primary-foreground/90",
              )}
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
