import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import authConfig from './auth.config';
import { db } from '@/lib/db';
import { users, accounts, sessions, verificationTokens } from '@/db/schema';
import { verifyChildLogin } from '@/lib/learner/credentials';
import { getLearner } from '@/lib/learner/crud';

// Full (Node-runtime) Auth.js instance: edge-safe base (auth.config) + the Drizzle adapter
// and the child Credentials provider, both of which touch the native better-sqlite3 handle.
// Used by the API route handler and server-side `auth()` calls. Middleware uses auth.config.

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    ...authConfig.providers,
    Credentials({
      id: 'child',
      name: 'Child PIN',
      credentials: { username: {}, pin: {} },
      authorize(creds) {
        const username = String(creds?.username ?? '');
        const pin = String(creds?.pin ?? '');
        const learnerId = verifyChildLogin(db, username, pin);
        if (learnerId == null) return null;
        const learner = getLearner(db, learnerId);
        // `kind`/`learnerId` are read by the jwt callback in auth.config.ts.
        return { id: `learner:${learnerId}`, name: learner?.displayName ?? username, kind: 'child', learnerId };
      },
    }),
  ],
});
