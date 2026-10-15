import { redirect } from "next/navigation";

import { SignUpForm } from "./_components/sign-up-form";
import { auth } from "@/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Create account" };

export default async function SignUpPage() {
  const session = await auth();
  if (session) redirect("/profile");

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">
            <h1>Create an account</h1>
          </CardTitle>
          <CardDescription>
            You&apos;ll need to verify your email before you can sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>
    </div>
  );
}
