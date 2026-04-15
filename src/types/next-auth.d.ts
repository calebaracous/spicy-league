import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    displayName: string | null;
    role: "user" | "admin";
  }

  interface Session {
    user: {
      id: string;
      displayName: string | null;
      role: "user" | "admin";
    } & DefaultSession["user"];
  }
}
