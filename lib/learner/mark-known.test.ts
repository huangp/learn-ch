import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters, learnerChars } from '../../db/schema';
import { createLearner, getLearner } from './crud';
import { seedLearner } from './seed';
import { markWordsKnown } from './mark-known';

const NOW = 1_750_000_000_000;
const WORD = '我们'; // chars 我 / 们 both exist in the seeded characters table

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

function statusOf(learnerId: number, charIds: number[]) {
  return t.db
    .select({ charId: learnerChars.charId, status: learnerChars.status })
    .from(learnerChars)
    .where(and(eq(learnerChars.learnerId, learnerId), inArray(learnerChars.charId, charIds)))
    .all();
}

describe('markWordsKnown', () => {
  test('seeds a word’s chars as review, is idempotent, and preserves placement method', () => {
    const learner = createLearner(t.db, 'mark', { placementMethod: 'paste' }, NOW);
    seedLearner(t.db, learner.id, [], 'paste', NOW); // empty known set

    const ids = t.db.select({ id: characters.id }).from(characters).where(inArray(characters.char, [...WORD])).all().map((r) => r.id);
    expect(ids.length).toBe(2);

    const seeded = markWordsKnown(t.db, learner.id, [WORD]);
    expect(seeded).toBe(2);

    const rows = statusOf(learner.id, ids);
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r.status).toBe('review'); // self-report is review, never mastered

    // re-running adds nothing (non-downgrading / idempotent)
    expect(markWordsKnown(t.db, learner.id, [WORD])).toBe(0);

    // placement method is untouched (we don't overwrite it with a fake method)
    expect(getLearner(t.db, learner.id)?.settings.placementMethod).toBe('paste');
  });

  test('does not downgrade a char already promoted past review', () => {
    const learner = createLearner(t.db, 'no-downgrade', { placementMethod: 'hsk' }, NOW);
    seedLearner(t.db, learner.id, [], 'hsk', NOW);
    const [oneId] = t.db.select({ id: characters.id }).from(characters).where(eq(characters.char, '我')).all().map((r) => r.id);

    markWordsKnown(t.db, learner.id, [WORD]);
    t.db.update(learnerChars).set({ status: 'mastered' }).where(and(eq(learnerChars.learnerId, learner.id), eq(learnerChars.charId, oneId))).run();

    markWordsKnown(t.db, learner.id, [WORD]); // re-mark
    expect(statusOf(learner.id, [oneId])[0].status).toBe('mastered'); // stays mastered
  });

  test('returns 0 when nothing resolves to a known char', () => {
    const learner = createLearner(t.db, 'noop', {}, NOW);
    seedLearner(t.db, learner.id, [], 'zero', NOW);
    expect(markWordsKnown(t.db, learner.id, ['abc'])).toBe(0); // no Han chars
  });
});
