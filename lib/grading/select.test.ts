import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { charComponents, learnerChars } from '../../db/schema';
import { createLearner } from '../learner/crud';
import { seedLearner } from '../learner/seed';
import { selfDeclareHsk } from '../placement/index';
import { buildCurriculum } from './curriculum';
import { selectDueChars, selectNewChars } from './select';

const NOW = 1_750_000_000_000; // fixed epoch for deterministic due dates

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

/** charId → distinct prerequisite component charIds (mirrors select.ts' private helper). */
function prereqMap(): Map<number, number[]> {
  const edges = t.db.select({ charId: charComponents.charId, componentId: charComponents.componentId }).from(charComponents).all();
  const m = new Map<number, number[]>();
  for (const e of edges) {
    if (e.charId === e.componentId) continue;
    const arr = m.get(e.charId);
    if (arr) arr.push(e.componentId);
    else m.set(e.charId, [e.componentId]);
  }
  return m;
}

/** First curriculum char that has ≥1 prerequisite component, plus its position + prereqs. */
function firstCharWithPrereq(): { c: number; pos: number; prereqs: number[] } {
  const order = buildCurriculum(t.db);
  const prereqs = prereqMap();
  for (let i = 0; i < order.length; i++) {
    const deps = prereqs.get(order[i]);
    if (deps && deps.length > 0) return { c: order[i], pos: i, prereqs: deps };
  }
  throw new Error('no char with prerequisites in curriculum');
}

describe('selectNewChars', () => {
  test('returns up to n unknown chars after the frontier, each with all prereqs known', () => {
    const learner = createLearner(t.db, 'hsk1', {}, NOW);
    const known = selfDeclareHsk(t.db, 1);
    seedLearner(t.db, learner.id, known, 'hsk', NOW);

    const order = buildCurriculum(t.db);
    const pos = new Map(order.map((id, i) => [id, i]));
    const knownSet = new Set(known);
    const prereqs = prereqMap();

    const out = selectNewChars(t.db, learner.id, 3);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(3);
    for (const id of out) {
      expect(knownSet.has(id)).toBe(false); // never re-offer a known char
      for (const dep of prereqs.get(id) ?? []) expect(knownSet.has(dep)).toBe(true); // §6.3 prereqs satisfied
    }
    // strictly increasing curriculum positions (walks order forward)
    const positions = out.map((id) => pos.get(id)!);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('§6.3 — never returns a char whose prerequisite is not known', () => {
    const { c, pos, prereqs } = firstCharWithPrereq();
    const order = buildCurriculum(t.db);
    // know everything before c EXCEPT one of its prerequisites → that prereq is unknown
    const missing = prereqs[0];
    const known = order.slice(0, pos).filter((id) => id !== missing);

    const learner = createLearner(t.db, 'missing-prereq', {}, NOW);
    seedLearner(t.db, learner.id, known, 'hsk', NOW);

    const out = selectNewChars(t.db, learner.id, 10);
    expect(out).not.toContain(c); // c is blocked by the unmet prereq
  });

  test('a prerequisite at status `learning` does not unlock its dependent (review/mastered gate)', () => {
    const { c, pos, prereqs } = firstCharWithPrereq();
    const order = buildCurriculum(t.db);
    const known = order.slice(0, pos); // know everything before c → frontier is c, all prereqs `review`

    const learner = createLearner(t.db, 'learning-prereq', {}, NOW);
    seedLearner(t.db, learner.id, known, 'hsk', NOW);

    // with all prereqs `review`, c is offered
    expect(selectNewChars(t.db, learner.id, 1)).toEqual([c]);

    // downgrade one prereq to `learning` (still "known", but not prereq-ready)
    t.db
      .update(learnerChars)
      .set({ status: 'learning' })
      .where(and(eq(learnerChars.learnerId, learner.id), eq(learnerChars.charId, prereqs[0])))
      .run();

    expect(selectNewChars(t.db, learner.id, 5)).not.toContain(c);
  });

  test('returns [] for n <= 0 and for a fully-known learner', () => {
    const learner = createLearner(t.db, 'edge', {}, NOW);
    const all = buildCurriculum(t.db);
    seedLearner(t.db, learner.id, all, 'hsk', NOW);

    expect(selectNewChars(t.db, learner.id, 0)).toEqual([]);
    expect(selectNewChars(t.db, learner.id, 3)).toEqual([]); // frontier is null
  });
});

describe('selectDueChars', () => {
  test('returns review chars ordered by due asc, capped at maxDue', () => {
    const learner = createLearner(t.db, 'due', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 3), 'hsk', NOW);

    const out = selectDueChars(t.db, learner.id, 3);
    expect(out.length).toBe(3);

    const rows = t.db
      .select({ charId: learnerChars.charId, status: learnerChars.status, due: learnerChars.due })
      .from(learnerChars)
      .where(and(eq(learnerChars.learnerId, learner.id), inArray(learnerChars.charId, out)))
      .all();
    const dueById = new Map(rows.map((r) => [r.charId, r.due!]));
    for (const r of rows) expect(r.status).toBe('review');
    const dues = out.map((id) => dueById.get(id)!);
    expect([...dues].sort((a, b) => a - b)).toEqual(dues); // already ascending
  });

  test('excludes new/mastered status (only review + learning are due)', () => {
    const learner = createLearner(t.db, 'exclude', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 3), 'hsk', NOW);

    const soonest = selectDueChars(t.db, learner.id, 1)[0];
    t.db
      .update(learnerChars)
      .set({ status: 'mastered' })
      .where(and(eq(learnerChars.learnerId, learner.id), eq(learnerChars.charId, soonest)))
      .run();

    expect(selectDueChars(t.db, learner.id, 5)).not.toContain(soonest);
  });

  test('includes learning chars so they stay in rotation (consolidation, anti-stall)', () => {
    const learner = createLearner(t.db, 'learning-due', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 3), 'hsk', NOW);

    // make the soonest-due char `learning` (a stalled, fallen-out-of-rotation char)
    const soonest = selectDueChars(t.db, learner.id, 1)[0];
    t.db
      .update(learnerChars)
      .set({ status: 'learning' })
      .where(and(eq(learnerChars.learnerId, learner.id), eq(learnerChars.charId, soonest)))
      .run();

    // it's still returned (now eligible), and ordering stays by due asc
    const out = selectDueChars(t.db, learner.id, 5);
    expect(out).toContain(soonest);
    const rows = t.db
      .select({ charId: learnerChars.charId, due: learnerChars.due })
      .from(learnerChars)
      .where(and(eq(learnerChars.learnerId, learner.id), inArray(learnerChars.charId, out)))
      .all();
    const dueById = new Map(rows.map((r) => [r.charId, r.due!]));
    const dues = out.map((id) => dueById.get(id)!);
    expect([...dues].sort((a, b) => a - b)).toEqual(dues);
  });

  test('returns [] for maxDue <= 0', () => {
    const learner = createLearner(t.db, 'zero-due', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 1), 'hsk', NOW);
    expect(selectDueChars(t.db, learner.id, 0)).toEqual([]);
  });
});
