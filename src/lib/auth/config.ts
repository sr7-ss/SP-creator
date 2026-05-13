import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/client';
import { isAdminEmail } from '@/lib/auth/admin-flag';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // default: 1 day (short session)
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        rememberMe: { label: 'Remember Me', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.passwordHash) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          // Pack plan/credits into the user object so jwt callback can read them
          // without making another DB call (which fails on Edge runtime)
          plan: user.plan,
          credits: user.credits,
          rememberMe: credentials.rememberMe === 'true',
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Store plan/credits from authorize() — no DB call needed here
        const u = user as Record<string, unknown>;
        token.plan = u.plan;
        token.credits = u.credits;
        if (u.rememberMe) {
          token.maxAge = 30 * 24 * 60 * 60; // 30 days
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        const u = session.user as unknown as Record<string, unknown>;
        u.plan = token.plan;
        u.credits = token.credits;
        u.isAdmin = isAdminEmail(session.user.email);
      }
      return session;
    },
  },
});
