import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '../db';
import { charComponents, learnerChars } from '../../db/schema';
import { buildCurriculum, computeFrontier } from './curriculum';

// Phase 6 progression selectors (§6.2, §8.1). Both derive learner state from
// `learner_chars` — they pick what the next story teaches (new targets) and what it
// quietly reviews (due chars). Pure DB reads; persistence/promotion is Phase 5/7.

const KNOWN = ['learning', 'review', 'mastered']; // already introduced — never re-offer as new
const PREREQ_READY = ['review', 'mastered']; // §6.2: a target's components must be solidly known

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
 * §6.2 — walk curriculum order from the learner's frontier, skip already-known chars,
 * and return the next `n` whose prerequisite components the learner has reached
 * `review`/`mastered` on.
 */
export function selectNewChars(db: Db, learnerId: number, n: number): number[] {
  if (n <= 0) return [];
  const rows = db
    .select({ charId: learnerChars.charId, status: learnerChars.status })
    .from(learnerChars)
    .where(eq(learnerChars.learnerId, learnerId))
    .all();
  const known = new Set<number>(); // learning/review/mastered → skip + frontier basis
  const ready = new Set<number>(); // review/mastered → satisfies a prerequisite
  for (const r of rows) {
    if (KNOWN.includes(r.status)) known.add(r.charId);
    if (PREREQ_READY.includes(r.status)) ready.add(r.charId);
  }

  const order = buildCurriculum(db);
  const frontier = computeFrontier(order, known);
  if (frontier === null) return [];
  const prereqs = prereqMap(db);

  const out: number[] = [];
  let started = false;
  for (const id of order) {
    if (id === frontier) started = true;
    if (!started || known.has(id)) continue;
    const deps = prereqs.get(id) ?? [];
    if (deps.every((d) => ready.has(d))) out.push(id);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * §8.1 — soonest-due chars to weave in for review (overdue first via `due ASC`), capped at `maxDue`.
 * Includes `learning` as well as `review` so a `learning` char keeps re-appearing and re-grading
 * (accruing exposures + stability) until it promotes — otherwise it falls out of rotation
 * (selectNewChars skips it too) and can stall in `learning`, blocking its downstream curriculum
 * dependents.
 */
export function selectDueChars(db: Db, learnerId: number, maxDue: number): number[] {
  if (maxDue <= 0) return [];
  return db
    .select({ charId: learnerChars.charId })
    .from(learnerChars)
    .where(and(eq(learnerChars.learnerId, learnerId), inArray(learnerChars.status, ['review', 'learning']), isNotNull(learnerChars.due)))
    .orderBy(asc(learnerChars.due))
    .limit(maxDue)
    .all()
    .map((r) => r.charId);
}
