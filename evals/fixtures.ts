import { and, asc, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import type { Db } from '../lib/db.js';
import { characters, charComponents, learnerChars } from '../db/schema.js';
import { buildCurriculum, computeFrontier } from '../lib/grading/curriculum.js';
import { selfDeclareHsk } from '../lib/placement/index.js';
import { createLearner } from '../lib/learner/crud.js';
import { seedLearner } from '../lib/learner/seed.js';

// Eval fixtures (§12): a spread of learner profiles. Each is seeded in an ephemeral
// DB copy, then given targets/due via the thin helper below — a stand-in for the
// Phase 6 selectNewChars/selectDueChars (deferred), good enough to exercise generation.

const NOW = 1_750_000_000_000;

export interface EvalFixture {
  name: string;
  learnerId: number;
  targetCharIds: number[];
  dueCharIds: number[];
  bootstrap: boolean;
  lengthChars: number;
  themes: string[];
}

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
function selectTargets(db: Db, knownSet: Set<number>, n: number): number[] {
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
function selectDue(db: Db, learnerId: number, maxDue: number): number[] {
  return db
    .select({ charId: learnerChars.charId })
    .from(learnerChars)
    .where(and(eq(learnerChars.learnerId, learnerId), eq(learnerChars.status, 'review'), isNotNull(learnerChars.due)))
    .orderBy(asc(learnerChars.due))
    .limit(maxDue)
    .all()
    .map((r) => r.charId);
}

/** First `n` curriculum chars (for the bootstrap profile's "already introduced" set). */
function firstCurriculum(db: Db, n: number): number[] {
  return buildCurriculum(db).slice(0, n);
}

export interface FixtureSpec {
  name: string;
  hsk?: number; // HSK self-declare level
  bootstrapKnown?: number; // bootstrap: seed the first N curriculum chars instead
  targets: number;
  maxDue: number;
  lengthChars: number;
  themes: string[];
}

export const FIXTURE_SPECS: FixtureSpec[] = [
  { name: 'hsk1-early', hsk: 1, targets: 2, maxDue: 2, lengthChars: 70, themes: ['friendship', 'mystery'] },
  { name: 'hsk2', hsk: 2, targets: 3, maxDue: 3, lengthChars: 90, themes: ['adventure'] },
  { name: 'hsk3', hsk: 3, targets: 3, maxDue: 3, lengthChars: 100, themes: ['history (Mulan retold)'] },
  { name: 'hsk4-mid', hsk: 4, targets: 3, maxDue: 4, lengthChars: 120, themes: ['sci-fi'] },
  { name: 'bootstrap', bootstrapKnown: 30, targets: 2, maxDue: 0, lengthChars: 50, themes: ['friendship'] },
];

/** Materialize every spec into a runnable fixture (creates learners in `db`). */
export function buildFixtures(db: Db): EvalFixture[] {
  return FIXTURE_SPECS.map((spec) => {
    const learnerId = createLearner(db, spec.name, {}, NOW).id;
    let known: number[];
    let method: 'hsk' | 'zero';
    if (spec.bootstrapKnown != null) {
      known = firstCurriculum(db, spec.bootstrapKnown);
      method = 'zero';
    } else {
      known = selfDeclareHsk(db, spec.hsk!);
      method = 'hsk';
    }
    seedLearner(db, learnerId, known, method, NOW);
    const knownSet = new Set(known);
    const targetCharIds = selectTargets(db, knownSet, spec.targets);
    const dueCharIds = spec.maxDue > 0 ? selectDue(db, learnerId, spec.maxDue) : [];
    return {
      name: spec.name,
      learnerId,
      targetCharIds,
      dueCharIds,
      bootstrap: spec.bootstrapKnown != null,
      lengthChars: spec.lengthChars,
      themes: spec.themes,
    };
  });
}

export { NOW };
