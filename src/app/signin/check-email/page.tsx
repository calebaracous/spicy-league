import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckEmailPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a magic link to your inbox. Click the link to finish signing in. You can close
            this tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Didn&apos;t get it? Check your spam folder, or try again from the sign-in page.
        </CardContent>
      </Card>
    </main>
  );
}
