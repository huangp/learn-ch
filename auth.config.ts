import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

// Edge-safe Auth.js config: NO database/native imports, so it can run in the middleware
// (Edge runtime). The full config in auth.ts spreads this and adds the Drizzle adapter +
// the Credentials provider (both Node-only). Callbacks live here because they touch no DB.

export default {
  trustHost: true, // self-hosted (not Vercel): trust the proxied Host header
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [Google],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { kind?: string; learnerId?: number; id?: string };
        if (u.kind === 'child') {
          token.kind = 'child';
          token.learnerId = u.learnerId;
          delete token.userId;
        } else {
          token.kind = 'adult';
          token.userId = u.id; // users.id from the adapter
          delete token.learnerId;
        }
      }
      return token;
    },
    session({ session, token }) {
      // Carry kind/userId/learnerId onto the session (read by lib/auth/access.ts).
      return {
        ...session,
        kind: token.kind,
        userId: token.userId,
        learnerId: token.learnerId,
      } as typeof session;
    },
  },
} satisfies NextAuthConfig;
