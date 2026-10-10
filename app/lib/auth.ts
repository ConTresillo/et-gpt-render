import { mkdir, writeFile } from "node:fs/promises";
import { log } from "@/lib/logger";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, anonymous } from "better-auth/plugins";
import { adminDb, adminSql } from "@/lib/db/admin";
import {
  account,
  authRateLimit,
  session,
  user,
  verification,
} from "@/lib/db/schema";

const crossSite = process.env.COOKIE_CROSS_SITE === "1";

// ponytail: no SMTP yet. Verification links are logged (and written to
// DEV_MAIL_DIR for tests). Add an SMTP sender here before production.
async function sendVerificationEmail({
  user: u,
  url,
}: {
  user: { email: string };
  url: string;
}) {
  log.auth.info({ email: u.email, url }, "verification link generated");
  const dir = process.env.DEV_MAIL_DIR;
  if (dir) {
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/${u.email}.txt`, url);
  }
}

export const authServer = betterAuth({
  advanced: {
    database: { generateId: () => randomUUID() },
    defaultCookieAttributes: crossSite
      ? { sameSite: "none", secure: true }
      : { sameSite: "lax" },
  },
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(adminDb, {
    provider: "pg",
    schema: {
      account,
      rateLimit: authRateLimit,
      session,
      user,
      verification,
    },
  }),
  emailAndPassword: {
    autoSignIn: false,
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignUp: true,
    sendVerificationEmail,
  },
  plugins: [
    anonymous({
      emailDomainName: process.env.GUEST_EMAIL_DOMAIN ?? "guest.etgpt.local",
      // Guest signs up/in: keep their chats, then the guest row is removed.
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        await adminSql`update "Chat" set "userId" = ${newUser.user.id} where "userId" = ${anonymousUser.user.id}`;
      },
    }),
    admin({ adminRoles: ["admin"], defaultRole: "user" }),
    nextCookies(),
  ],
  rateLimit: {
    customRules: {
      "/sign-in/email": { max: 5, window: 60 },
      "/sign-up/email": { max: 5, window: 3600 },
    },
    enabled: true,
    modelName: "rateLimit",
    storage: "database",
  },
  secret: process.env.BETTER_AUTH_SECRET,
  session: {
    cookieCache: { enabled: false },
    expiresIn: 60 * 60 * 24 * 30,
  },
});
