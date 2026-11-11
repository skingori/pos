import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { Role } from "@prisma/client";
import { ensureUserHasPermissions } from "./rbac";
import type { Permission } from "./permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: Role;
      permissions: Permission[];
      mustChangePassword: boolean;
      branchId?: string | null;
    };
  }
  interface User {
    role: Role;
    permissions: Permission[];
    mustChangePassword: boolean;
    branchId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    permissions: Permission[];
    mustChangePassword: boolean;
    branchId?: string | null;
  }
}

const isProd = process.env.NODE_ENV === "production";
// Secure cookies only work over HTTPS. Contabo IP deploys use http://IP:3000.
const useSecureCookies =
  (process.env.NEXTAUTH_URL || "").trim().toLowerCase().startsWith("https://");

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  useSecureCookies,
  cookies: useSecureCookies
    ? {
        sessionToken: {
          name: `__Secure-next-auth.session-token`,
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
          },
        },
      }
    : undefined,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        if (isProd && process.env.NEXTAUTH_SECRET === "change-me-use-openssl-rand-base64-32") {
          throw new Error("NEXTAUTH_SECRET is still the example value");
        }
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user || !user.active) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        const permissions = await ensureUserHasPermissions(user.id, user.role);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permissions,
          mustChangePassword: user.mustChangePassword,
          branchId: user.branchId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.permissions = user.permissions ?? [];
        token.mustChangePassword = user.mustChangePassword;
        token.branchId = user.branchId;
      }
      if (trigger === "update" && session) {
        if (typeof session.mustChangePassword === "boolean") {
          token.mustChangePassword = session.mustChangePassword;
        }
        if (Array.isArray(session.permissions)) {
          token.permissions = session.permissions;
        }
        if (session.role) {
          token.role = session.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.permissions = token.permissions ?? [];
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.branchId = token.branchId ?? null;
      }
      return session;
    },
  },
};
