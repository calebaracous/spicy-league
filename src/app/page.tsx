import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase">
          Spicy League
        </p>
        <h1 className="text-5xl font-bold tracking-tight text-balance sm:text-6xl">
          Captains-draft tournaments for League of Legends and CS2.
        </h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-lg text-balance">
          Sign up for a season, get drafted onto a team, and compete through a round-robin group
          stage into a single-elimination bracket.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/seasons" className={cn(buttonVariants({ size: "lg" }))}>
          View seasons
        </Link>
        <Link href="/signup" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
          Sign up
        </Link>
      </div>
    </main>
  );
}
