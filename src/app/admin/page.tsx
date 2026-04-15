import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-6 py-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground text-sm">Only users with the admin role see this.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            Season creation, signup management, and captain selection will live here.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Build out in Phase 2 and beyond.
        </CardContent>
      </Card>
    </main>
  );
}
