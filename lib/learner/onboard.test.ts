import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, eq, gt, isNotNull, lte } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters, learnerChars } from '../../db/schema';
import { selfDeclareHsk, fromToggleGrid } from '../placement/index';
import { onboardLearner } from './onboard';

const NOW = 1_750_000_000_000;

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

function seededCount(learnerId: number) {
  return t.db.select({ charId: learnerChars.charId }).from(learnerChars).where(eq(learnerChars.learnerId, learnerId)).all().length;
}

describe('onboardLearner', () => {
  test('hsk path seeds the HSK-level known set, not in bootstrap', () => {
    const expected = selfDeclareHsk(t.db, 3).length;
    const learner = onboardLearner(t.db, { name: 'hsk3', method: 'hsk', hsk: 3, now: NOW });
    expect(learner.settings.placementMethod).toBe('hsk');
    expect(learner.settings.bootstrap).toBe(false);
    expect(learner.settings.frontierCharId).toBeTypeOf('number');
    expect(seededCount(learner.id)).toBe(expected);
  });

  test('paste path keeps only matched Simplified chars', () => {
    const learner = onboardLearner(t.db, { name: 'paste', method: 'paste', paste: '你好世界 abc 123', now: NOW });
    expect(learner.settings.placementMethod).toBe('paste');
    // 4 distinct Han chars, all common → all in the master
    expect(seededCount(learner.id)).toBe(4);
  });

  test('grid path seeds the cutoff ∪ known − unknown set', () => {
    // one char above the cutoff (fine "known") and one at/below it (fine "unknown")
    const above = t.db
      .select({ char: characters.char })
      .from(characters)
      .where(and(isNotNull(characters.freqRank), gt(characters.freqRank, 100)))
      .limit(1)
      .get()!;
    const below = t.db
      .select({ char: characters.char })
      .from(characters)
      .where(and(isNotNull(characters.freqRank), lte(characters.freqRank, 100)))
      .limit(1)
      .get()!;

    const grid = { cutoffFreqRank: 100, gridKnown: [above.char], gridUnknown: [below.char] };
    const expected = fromToggleGrid(t.db, { cutoffFreqRank: 100, known: [above.char], unknown: [below.char] }).length;

    const learner = onboardLearner(t.db, { name: 'grid', method: 'grid', ...grid, now: NOW });
    expect(learner.settings.placementMethod).toBe('grid');
    expect(seededCount(learner.id)).toBe(expected);
  });

  test('zero path seeds a small bootstrap base and enters bootstrap mode', () => {
    const learner = onboardLearner(t.db, { name: 'zero', method: 'zero', bootstrapKnown: 30, now: NOW });
    expect(learner.settings.placementMethod).toBe('zero');
    expect(learner.settings.bootstrap).toBe(true);
    expect(seededCount(learner.id)).toBe(30);
  });
});
