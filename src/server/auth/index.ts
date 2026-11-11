import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/server/db";
import { rateLimiter } from "@/server/providers/rate-limit";
import { getClientIp } from "@/server/request";
import { authenticate } from "./authenticate";
import { getDummyHash, verifyPassword } from "./password";

declare module "next-auth" {
  interface User {
    sessionVersion?: number;
  }
  interface Session {
    sessionVersion?: number;
  }
}

/** Error codes reach the login form via `error.code`. Keep them vague. */
export class InvalidLoginError extends CredentialsSignin {
  code = "invalid";
}
export class DeactivatedLoginError extends CredentialsSignin {
  code = "deactivated";
}
export class RateLimitedLoginError extends CredentialsSignin {
  code = "rate_limited";
}

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // signed out after a week of no use
const SESSION_UPDATE_AGE_SECONDS = 60 * 60; // cookie re-issued at most hourly while in use

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credentials sign-in requires JWT sessions in Auth.js. The cookie is an
  // encrypted, httpOnly JWE. Revocation is enforced per request in the DAL
  // (isActive + sessionVersion), see ./session.ts.
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  pages: { signIn: "/login", error: "/login" },
  logger: {
    // A wrong password is normal, not a server error. Keep real errors loud.
    error(error) {
      if (error.name === "CredentialsSignin" || (error as { type?: string }).type === "CredentialsSignin") return;
      console.error("[auth]", error);
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const ip = getClientIp(request.headers);
        const result = await authenticate(credentials, ip, {
          findUserByEmail: (email) =>
            db.user.findUnique({
              where: { email },
              select: { id: true, passwordHash: true, isActive: true, sessionVersion: true },
            }),
          verifyPassword,
          dummyHash: getDummyHash,
          limiter: rateLimiter,
          onSuccess: async (userId, ipAddress) => {
            await db.$transaction([
              db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
              db.auditLog.create({
                data: {
                  action: "auth.signed_in",
                  actorId: userId,
                  entityType: "User",
                  entityId: userId,
                  ipAddress,
                },
              }),
            ]);
          },
        });

        if (result.ok) return { id: result.userId, sessionVersion: result.sessionVersion };
        if (result.reason === "rate_limited") throw new RateLimitedLoginError();
        if (result.reason === "deactivated") throw new DeactivatedLoginError();
        throw new InvalidLoginError();
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // Only set on sign-in. "update" triggers are ignored on purpose: nothing a
      // client sends can change what's in the token.
      if (user?.id) {
        token.sub = user.id;
        token.sv = user.sessionVersion ?? 0;
        delete token.name;
        delete token.email;
        delete token.picture;
      }
      return token;
    },
    session({ session, token }) {
      session.user = { id: token.sub ?? "" } as typeof session.user;
      session.sessionVersion = typeof token.sv === "number" ? token.sv : undefined;
      return session;
    },
  },
});
