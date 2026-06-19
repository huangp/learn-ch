import { eq } from 'drizzle-orm';
import type { Db } from '../db.js';
import { learners } from '../../db/schema.js';

// Learner CRUD. A typical onboard is: createLearner → placement resolver → seedLearner.
// Placement is re-runnable; the no-downgrade guarantee for already-promoted chars
// lives in seedLearner (onConflictDoNothing on learner_chars), not here.

export interface LearnerSettings {
  placementMethod?: string;
  frontierCharId?: number | null;
  bootstrap?: boolean;
  [key: string]: unknown;
}

export interface Learner {
  id: number;
  displayName: string;
  createdAt: number;
  settings: LearnerSettings;
}

function parse(row: { id: number; displayName: string; createdAt: number; settings: string | null }): Learner {
  return { ...row, settings: row.settings ? JSON.parse(row.settings) : {} };
}

export function createLearner(
  db: Db,
  displayName: string,
  settings: LearnerSettings = {},
  now: number = Date.now(),
): Learner {
  const row = db
    .insert(learners)
    .values({ displayName, createdAt: now, settings: JSON.stringify(settings) })
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
