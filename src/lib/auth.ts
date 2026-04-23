import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Resend } from "resend";

import { db } from "@/db/client";
import { users, sessions, accounts, verifications } from "@/db/schema/auth";

const resend = new Resend(process.env.AUTH_RESEND_KEY);
const FROM = process.env.AUTH_EMAIL_FROM ?? "no-reply@spicyleague.dev";

// Only pass an explicit baseURL when one is configured. Without it Better Auth
// auto-detects from the incoming request's host, which is correct on Vercel
// where the host header is always reliable.
const BASE_URL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  ...(BASE_URL ? { baseURL: BASE_URL } : {}),

  // Trust any explicitly configured URL so that both a custom domain and the
  // *.vercel.app URL work without one blocking the other.
  trustedOrigins: [process.env.BETTER_AUTH_URL, process.env.NEXT_PUBLIC_APP_URL].filter(
    Boolean,
  ) as string[],

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,

    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: "Verify your email — Spicy League",
        html: `
          <p>Welcome to Spicy League!</p>
          <p>Click the link below to verify your email address and activate your account.</p>
          <p><a href="${url}" style="font-weight:bold">Verify email</a></p>
          <p>This link expires in 24 hours. If you didn't create an account you can ignore this email.</p>
        `,
      });
    },

    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: "Reset your password — Spicy League",
        html: `
          <p>We received a request to reset the password for your Spicy League account.</p>
          <p><a href="${url}" style="font-weight:bold">Reset password</a></p>
          <p>This link expires in 1 hour. If you didn't request a reset you can ignore this email.</p>
        `,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24 hours
  },

  session: {
    // Default session: 1 day. rememberMe=true extends to 30 days (set per-signIn).
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 60 * 12,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  user: {
    additionalFields: {
      displayName: {
        type: "string",
        required: false,
        unique: true,
        defaultValue: null,
        input: false,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
      bio: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false,
      },
      pronouns: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false,
      },
      opggUrl: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false,
      },
    },
  },

  advanced: {
    cookiePrefix: "sl",
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
