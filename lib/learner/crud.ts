import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { learners } from '../../db/schema';

// Learner CRUD. A typical onboard is: createLearner → placement resolver → seedLearner.
// Placement is re-runnable; the no-downgrade guarantee for already-promoted chars
// lives in seedLearner (onConflictDoNothing on learner_chars), not here.

export interface LearnerSettings {
  placementMethod?: string;
  frontierCharId?: number | null;
  bootstrap?: boolean;
  /** Chosen companion persona (§11) — see lib/persona/presets.ts. */
  personaId?: string;
  /** Default story genre (§17.1) — see lib/genres/presets.ts; overridable per story. */
  genreId?: string;
  [key: string]: unknown;
}

export interface Learner {
  id: number;
  ownerId: string | null; // adult owner (users.id); null for legacy/dev rows
  displayName: string;
  username: string | null; // child direct-login handle (null = no direct login)
  createdAt: number;
  settings: LearnerSettings;
}

interface LearnerRow {
  id: number;
  ownerId: string | null;
  displayName: string;
  username: string | null;
  createdAt: number;
  settings: string | null;
}

// Explicit field copy — never spread the raw row, so `pinHash` can't leak out of the lib.
function parse(row: LearnerRow): Learner {
  return {
    id: row.id,
    ownerId: row.ownerId,
    displayName: row.displayName,
    username: row.username,
    createdAt: row.createdAt,
    settings: row.settings ? JSON.parse(row.settings) : {},
  };
}

export function createLearner(
  db: Db,
  displayName: string,
  settings: LearnerSettings = {},
  now: number = Date.now(),
  ownerId: string | null = null,
): Learner {
  const row = db
    .insert(learners)
    .values({ ownerId, displayName, createdAt: now, settings: JSON.stringify(settings) })
    .returning()
    .get();
  return parse(row);
}

export function getLearner(db: Db, id: number): Learner | null {
  const row = db.select().from(learners).where(eq(learners.id, id)).get();
  return row ? parse(row) : null;
}

export function listLearners(db: Db): Learner[] {
  return db.select().from(learners).all().map(parse);
}

/** Learners owned by one adult (the dashboard list). */
export function listLearnersByOwner(db: Db, ownerId: string): Learner[] {
  return db.select().from(learners).where(eq(learners.ownerId, ownerId)).all().map(parse);
}

/** Update display name and/or merge settings (existing keys preserved unless overridden). */
export function updateLearner(
  db: Db,
  id: number,
  patch: { displayName?: string; settings?: LearnerSettings },
): Learner | null {
  const current = getLearner(db, id);
  if (!current) return null;
  const next = {
    displayName: patch.displayName ?? current.displayName,
    settings: JSON.stringify({ ...current.settings, ...(patch.settings ?? {}) }),
  };
  db.update(learners).set(next).where(eq(learners.id, id)).run();
  return getLearner(db, id);
}

/** Delete a learner; learner_chars / stories / interactions cascade via FK. */
export function deleteLearner(db: Db, id: number): void {
  db.delete(learners).where(eq(learners.id, id)).run();
}
