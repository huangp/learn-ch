import { auth } from '@/auth';
import { AccessError, type SessionContext } from './access';

// Auth.js session → SessionContext mapping. Imports next-auth, so it is kept separate from
// the pure authz logic in ./access (which stays unit-testable without booting NextAuth).
// Used only from server components / server actions.

/** Map the Auth.js session into a SessionContext (null if signed out / malformed). */
export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth();
  if (!session) return null;
  const s = session as { kind?: string; userId?: string; learnerId?: number };
  if (s.kind === 'child' && typeof s.learnerId === 'number') return { kind: 'child', learnerId: s.learnerId };
  if (s.kind === 'adult' && typeof s.userId === 'string') return { kind: 'adult', userId: s.userId };
  return null;
}

/** Like getSessionContext but throws when signed out — for server actions. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new AccessError('Not signed in');
  return ctx;
}

/** Require an adult session (onboarding, child management). */
export async function requireAdult(): Promise<{ kind: 'adult'; userId: string }> {
  const ctx = await requireSession();
  if (ctx.kind !== 'adult') throw new AccessError('Adults only');
  return ctx;
}
