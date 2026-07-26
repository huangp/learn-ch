import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { inArray } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters, learnerChars } from '../../db/schema';
import { createLearner } from '../learner/crud';
import { documentStats, coverageForLearners } from './analyze';

const NOW = 1_750_000_000_000;

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

/** Map chars → their charIds from the seeded master table. */
function idsFor(chars: string[]): Map<string, number> {
  const rows = t.db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.char, chars)).all();
  return new Map(rows.map((r) => [r.char, r.id]));
}

describe('documentStats', () => {
  test('counts distinct Han chars, ignoring punctuation / latin / repeats', () => {
    const s = documentStats('我你好，你好！ABC 123');
    expect(s.hanChars.sort()).toEqual(['你', '好', '我']);
    expect(s.uniqueHanCount).toBe(3);
    expect(s.totalChars).toBe('我你好，你好！ABC 123'.length);
  });

  test('empty / no-Han text', () => {
    expect(documentStats('').uniqueHanCount).toBe(0);
    expect(documentStats('hello world').uniqueHanCount).toBe(0);
    expect(documentStats('hello world').hanChars).toEqual([]);
  });
});

describe('coverageForLearners', () => {
  test('partitions the document into known / learning / new per learner', () => {
    const learnerId = createLearner(t.db, 'Cov', {}, NOW).id;
    const ids = idsFor(['我', '你', '好', '他']);
    // 我 mastered + 你 review → known; 好 learning → learning; 他 new → new bucket.
    t.db.insert(learnerChars).values([
      { learnerId, charId: ids.get('我')!, status: 'mastered' },
      { learnerId, charId: ids.get('你')!, status: 'review' },
      { learnerId, charId: ids.get('好')!, status: 'learning' },
      { learnerId, charId: ids.get('他')!, status: 'new' },
    ]).run();

    // Document distinct Han: 我 你 好 他 吗 (吗 absent from learner_chars → new).
    const { hanChars, uniqueHanCount } = documentStats('我你好，他吗？ Hi');
    expect(uniqueHanCount).toBe(5);

    const [cov] = coverageForLearners(t.db, [{ id: learnerId, displayName: 'Cov' }], hanChars);
    expect(cov.uniqueHan).toBe(5);
    expect(cov.known).toBe(2); // 我 + 你
    expect(cov.learning).toBe(1); // 好
    expect(cov.new).toBe(2); // 他 (status new) + 吗 (absent)
    expect(cov.known + cov.learning + cov.new).toBe(5);
    expect(cov.knownPct).toBeCloseTo(2 / 5);
    expect(cov.learningPct).toBeCloseTo(1 / 5);
    expect(cov.newPct).toBeCloseTo(2 / 5);
  });

  test('a learner with no chars → everything is new', () => {
    const learnerId = createLearner(t.db, 'Blank', {}, NOW).id;
    const { hanChars } = documentStats('我你好');
    const [cov] = coverageForLearners(t.db, [{ id: learnerId, displayName: 'Blank' }], hanChars);
    expect(cov.known).toBe(0);
    expect(cov.learning).toBe(0);
    expect(cov.new).toBe(3);
    expect(cov.newPct).toBe(1);
  });

  test('empty document → zero-count rows, no divide-by-zero', () => {
    const learnerId = createLearner(t.db, 'Empty', {}, NOW).id;
    const [cov] = coverageForLearners(t.db, [{ id: learnerId, displayName: 'Empty' }], []);
    expect(cov.uniqueHan).toBe(0);
    expect(cov.knownPct).toBe(0);
    expect(cov.new).toBe(0);
  });
});
