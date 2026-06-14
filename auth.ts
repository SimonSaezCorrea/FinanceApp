import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

import prisma from "@/lib/prisma";

const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

const providers: NextAuthConfig["providers"] = [];

if (googleConfigured) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      id: "dev-credentials",
      name: "Development login",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        if (!email || typeof email !== "string") return null;
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email },
        });
        return user;
      },
    }),
  );
}

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    jwt({ token, user, account }) {
      if (user) {
        token.sub = user.id;
      }
      if (account?.provider === "dev-credentials" && user?.email) {
        token.email = user.email;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
