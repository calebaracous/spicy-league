import { auth } from "@/auth";
import { SiteHeaderClient } from "./site-header-client";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user
    ? {
        name: session.user.name ?? session.user.username ?? null,
        role: session.user.role ?? null,
      }
    : null;

  return <SiteHeaderClient user={user} />;
}
