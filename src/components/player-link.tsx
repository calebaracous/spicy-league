import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Link to a player's public profile, or plain text when they have none: a
 * deleted account with league history keeps its row (shown as "Deleted
 * player") but loses its username. See src/lib/account-deletion.ts.
 */
export function PlayerLink({
  username,
  className,
  children,
}: {
  username: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (!username) return <span className={className}>{children}</span>;
  return (
    <Link href={`/users/${username}`} className={className}>
      {children}
    </Link>
  );
}
