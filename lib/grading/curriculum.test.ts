import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils.js';
import { characters, charComponents } from '../../db/schema.js';
import { analyzeCurriculum, buildCurriculum, computeFrontier } from './curriculum.js';

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

describe('buildCurriculum', () => {
  test('orders every character exactly once', () => {
    const { order } = analyzeCurriculum(t.db);
    const total = t.db.select({ id: characters.id }).from(characters).all().length;
    expect(order.length).toBe(total);
    expect(new Set(order).size).toBe(total);
  });

  test('is a valid topological order — every component precedes its char', () => {
    const { order, cycleCharIds } = analyzeCurriculum(t.db);
    const pos = new Map(order.map((id, i) => [id, i]));
    const cyc = new Set(cycleCharIds);
    const edges = t.db
      .select({ charId: charComponents.charId, componentId: charComponents.componentId })
      .from(charComponents)
      .all();

    let violations = 0;
    for (const e of edges) {
      if (e.charId === e.componentId) continue;
      if (cyc.has(e.charId) || cyc.has(e.componentId)) continue; // cycle tail is exempt (documented)
      if (pos.get(e.componentId)! > pos.get(e.charId)!) violations++;
    }
    expect(violations).toBe(0);
  });

  test('HSK1 characters cluster early (median in the first 40%)', () => {
    const { order } = analyzeCurriculum(t.db);
    const pos = new Map(order.map((id, i) => [id, i]));
    const hsk1 = t.db
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.hskLevel, 1))
      .all()
      .map((r) => pos.get(r.id)!)
      .sort((a, b) => a - b);
    const median = hsk1[Math.floor(hsk1.length / 2)];
    expect(median).toBeLessThan(order.length * 0.4);
  });
});

describe('computeFrontier', () => {
  test('returns the first curriculum char not in the known set', () => {
    const order = buildCurriculum(t.db);
    // know the first 10 curriculum chars → frontier is the 11th
    const known = new Set(order.slice(0, 10));
    expect(computeFrontier(order, known)).toBe(order[10]);
  });

  test('returns the very first char when nothing is known', () => {
    const order = buildCurriculum(t.db);
    expect(computeFrontier(order, new Set())).toBe(order[0]);
  });
});
