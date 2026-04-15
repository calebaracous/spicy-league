import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Props = { params: Promise<{ displayName: string }> };

export async function generateMetadata({ params }: Props) {
  const { displayName } = await params;
  return {
    title: `${displayName} — Spicy League`,
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { displayName } = await params;
  const normalized = displayName.toLowerCase();

  const user = await db.query.users.findFirst({
    where: eq(users.displayName, normalized),
  });

  if (!user || !user.displayName) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-12">
      <header className="space-y-1">
        <h1 className="font-mono text-4xl font-bold tracking-tight">{user.displayName}</h1>
        {user.pronouns ? <p className="text-muted-foreground text-sm">{user.pronouns}</p> : null}
      </header>
      <Separator />
      {user.bio ? <p className="text-base leading-relaxed">{user.bio}</p> : null}
      {user.opggUrl ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">League of Legends</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={user.opggUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary text-sm font-medium underline-offset-4 hover:underline"
            >
              View full stats on OP.GG →
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
