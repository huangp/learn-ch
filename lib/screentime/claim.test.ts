import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { createLearner } from '../learner/crud';
import type { GenerationMeta, StoryJson } from '../generation/types';
import { createStory, getStory } from '../story/persist';
import { recordCompletion, recordInteraction } from '../interactions/record';
import { claimStoryCredit, getCreditStatus, parseKidList } from './claim';
import { sign } from './code';

const NOW = 1_750_000_000_000;
const SECRET = 'test-secret';

function makeStory(t: TestDb, learnerId: number, questions: number): number {
  const comprehensionQuestions = Array.from({ length: questions }, () => ({ q: '好吗', options: ['好', '不'], answer: 0, testsChars: ['好'] }));
  const story: StoryJson = { title: 't', body: '好', targetCharsUsed: [], comprehensionQuestions, choices: [], glossary: [] };
  const meta = { model: 'm', repairIterations: 0, knownCoverage: 1, targetCoverage: 1, perSentenceMin: 1, fallbackUsed: false, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, latencyMs: 0 } satisfies GenerationMeta;
  return createStory(t.db, { learnerId, story, meta, segments: [], now: NOW }).id;
}

function answer(t: TestDb, learnerId: number, storyId: number, qi: number) {
  recordInteraction(t.db, { storyId, learnerId, char: '好', type: 'question_correct', value: qi, now: NOW });
}

let t: TestDb;
let learnerId: number;
beforeAll(() => {
  t = makeTestDb();
  learnerId = createLearner(t.db, 'credit', {}, NOW).id;
});
afterAll(() => t.cleanup());

describe('claimStoryCredit', () => {
  test('refuses before the reading is concluded', () => {
    const storyId = makeStory(t, learnerId, 1);
    answer(t, learnerId, storyId, 0);
    expect(claimStoryCredit(t.db, learnerId, storyId, 'jayden', SECRET, NOW)).toEqual({ error: expect.stringContaining('done reading') });
  });

  test('refuses until every question is answered (by question index)', () => {
    const storyId = makeStory(t, learnerId, 2);
    recordCompletion(t.db, { storyId, learnerId, now: NOW });
    answer(t, learnerId, storyId, 0);
    answer(t, learnerId, storyId, 0); // re-answering one question doesn't count twice
    recordInteraction(t.db, { storyId, learnerId, type: 'question_wrong', now: NOW }); // legacy row, no index
    expect(getCreditStatus(t.db, learnerId, storyId)).toMatchObject({ completed: true, answered: 1, total: 2 });
    expect(claimStoryCredit(t.db, learnerId, storyId, 'jayden', SECRET, NOW)).toEqual({ error: expect.stringContaining('(1/2)') });
  });

  test('mints a 10-minute code once done, and re-returns it on later claims', () => {
    const storyId = makeStory(t, learnerId, 2);
    recordCompletion(t.db, { storyId, learnerId, now: NOW });
    answer(t, learnerId, storyId, 0);
    answer(t, learnerId, storyId, 1);
    const claim = claimStoryCredit(t.db, learnerId, storyId, ' Jayden ', SECRET, NOW);
    if ('error' in claim) throw new Error(claim.error);
    expect(claim).toMatchObject({ kid: 'jayden', minutes: 10, claimedAt: NOW });
    const [mins, nonce, sig] = claim.code.split('-');
    expect(mins).toBe('10');
    expect(sig).toBe(sign(SECRET, 'jayden', 10, nonce));
    expect(claim.url).toBe(`http://screentime.lan/claim?kid=jayden&code=${claim.code}`);

    // idempotent — even with a different name, the stored claim comes back unchanged
    expect(claimStoryCredit(t.db, learnerId, storyId, 'amelia', SECRET, NOW + 1)).toEqual(claim);
    expect(getStory(t.db, storyId)?.meta?.creditClaim).toEqual(claim);
    expect(getStory(t.db, storyId)?.meta?.model).toBe('m'); // rest of meta kept
  });

  test('a story without questions needs only the completion', () => {
    const storyId = makeStory(t, learnerId, 0);
    recordCompletion(t.db, { storyId, learnerId, now: NOW });
    expect(claimStoryCredit(t.db, learnerId, storyId, 'amelia', SECRET, NOW)).toMatchObject({ kid: 'amelia', minutes: 10 });
  });

  test('rejects a malformed screentime name', () => {
    const storyId = makeStory(t, learnerId, 0);
    recordCompletion(t.db, { storyId, learnerId, now: NOW });
    expect(claimStoryCredit(t.db, learnerId, storyId, 'not a kid!', SECRET, NOW)).toEqual({ error: expect.stringContaining('screentime name') });
    expect(getCreditStatus(t.db, learnerId, storyId)?.claimed).toBeNull();
  });

  test("does not count another learner's story", () => {
    const other = createLearner(t.db, 'credit-other', {}, NOW).id;
    const storyId = makeStory(t, other, 0);
    recordCompletion(t.db, { storyId, learnerId: other, now: NOW });
    expect(claimStoryCredit(t.db, learnerId, storyId, 'amelia', SECRET, NOW)).toEqual({ error: 'Story not found.' });
  });
});

describe('parseKidList', () => {
  test('trims, lowercases, de-dupes and drops invalid names', () => {
    expect(parseKidList(' Amelia, jayden ,,bad name!,jayden')).toEqual(['amelia', 'jayden']);
  });

  test('is empty when unset', () => {
    expect(parseKidList(undefined)).toEqual([]);
  });
});
