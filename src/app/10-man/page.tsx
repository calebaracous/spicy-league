import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getActiveTenMan, getRecentTenMans } from "@/lib/ten-man";
import { TenManLanding } from "./_landing";

export const metadata = { title: "10-man · Spicy League" };

export default async function TenManLandingPage() {
  const [session, active, history] = await Promise.all([
    auth(),
    getActiveTenMan(),
    getRecentTenMans(10),
  ]);

  if (active) redirect(`/10-man/${active.id}`);

  const isAdmin = session?.user?.role === "admin";

  return <TenManLanding isAdmin={isAdmin} history={history} />;
}
