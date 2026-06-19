import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../lib/db.js';
import { charComponents, learnerChars } from '../db/schema.js';
import { buildCurriculum, computeFrontier } from '../lib/grading/curriculum.js';

// Thin stand-ins for the deferred Phase 6 selectors (selectNewChars/selectDueChars).
// Used by the eval fixtures and the story CLI to pick targets/due for an ad-hoc learner.
// Phase 6 should replace these with the real, SRS-aware progression logic.

/** Map charId → its prerequisite component charIds (distinct). */
function prereqMap(db: Db): Map<number, number[]> {
  const edges = db.select({ charId: charComponents.charId, componentId: charComponents.componentId }).from(charComponents).all();
  const m = new Map<number, number[]>();
  for (const e of edges) {
    if (e.charId === e.componentId) continue;
    const arr = m.get(e.charId);
    if (arr) arr.push(e.componentId);
    else m.set(e.charId, [e.componentId]);
  }
  return m;
}

/**
 * Next `n` curriculum chars past the learner's frontier whose every prerequisite
 * component the learner already knows — the stand-in for Phase 6 selectNewChars.
 */
export function selectTargets(db: Db, knownSet: Set<number>, n: number): number[] {
  const order = buildCurriculum(db);
  const frontier = computeFrontier(order, knownSet);
  if (frontier === null) return [];
  const prereqs = prereqMap(db);
  const out: number[] = [];
  let started = false;
  for (const id of order) {
    if (id === frontier) started = true;
    if (!started || knownSet.has(id)) continue;
    const deps = prereqs.get(id) ?? [];
    if (deps.every((d) => knownSet.has(d))) out.push(id);
    if (out.length >= n) break;
  }
  return out;
}

/** Soonest-due review chars (stand-in for Phase 6 selectDueChars). */
export function selectDue(db: Db, learnerId: number, maxDue: number): number[] {
  if (maxDue <= 0) return [];
  return db
    .select({ charId: learnerChars.charId })
    .from(learnerChars)
    .where(and(eq(learnerChars.learnerId, learnerId), eq(learnerChars.status, 'review'), isNotNull(learnerChars.due)))
    .orderBy(asc(learnerChars.due))
    .limit(maxDue)
    .all()
    .map((r) => r.charId);
}
