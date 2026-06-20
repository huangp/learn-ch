import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { learnerChars } from '../../db/schema';
import { selfDeclareHsk } from '../placement/index';
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

  test('zero path seeds a small bootstrap base and enters bootstrap mode', () => {
    const learner = onboardLearner(t.db, { name: 'zero', method: 'zero', bootstrapKnown: 30, now: NOW });
    expect(learner.settings.placementMethod).toBe('zero');
    expect(learner.settings.bootstrap).toBe(true);
    expect(seededCount(learner.id)).toBe(30);
  });
});
