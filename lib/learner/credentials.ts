import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { Db } from '../db';
import { learners } from '../../db/schema';

// Child direct-login credentials: a username + PIN the owning adult sets. Hashing is
// synchronous (bcryptjs *Sync) to match the synchronous DB/lib layer. The PIN is a
// low-entropy convenience secret for kids — not an adult password — but we still hash it.

const SALT_ROUNDS = 10;
const PIN_RE = /^\d{4,8}$/; // 4–8 digit PIN
const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;

export class CredentialError extends Error {}

/** Set/replace a child's login username + PIN. Adult-authorized at the call site. */
export function setChildCredentials(db: Db, learnerId: number, username: string, pin: string): void {
  const u = username.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) throw new CredentialError('Username must be 3–20 letters, digits, or underscores.');
  if (!PIN_RE.test(pin)) throw new CredentialError('PIN must be 4–8 digits.');

  const existing = db.select({ id: learners.id }).from(learners).where(eq(learners.username, u)).get();
  if (existing && existing.id !== learnerId) throw new CredentialError('That username is already taken.');

  const pinHash = bcrypt.hashSync(pin, SALT_ROUNDS);
  db.update(learners).set({ username: u, pinHash }).where(eq(learners.id, learnerId)).run();
}

/** Verify a child login. Returns the learner id on success, else null. */
export function verifyChildLogin(db: Db, username: string, pin: string): number | null {
  const u = username.trim().toLowerCase();
  const row = db
    .select({ id: learners.id, pinHash: learners.pinHash })
    .from(learners)
    .where(eq(learners.username, u))
    .get();
  if (!row || !row.pinHash) return null;
  return bcrypt.compareSync(pin, row.pinHash) ? row.id : null;
}
