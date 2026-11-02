import { beforeEach, afterEach, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { createLearner, getLearner } from '../learner/crud';
import type { GenerationMeta, StoryJson } from '../generation/types';
import { createStory, softDeleteStory } from '../story/persist';
import { recordCompletion, recordInteraction } from '../interactions/record';
import { claimWeeklyBonus, finishedDays, getBonusStatus } from './bonus';
import { sign } from './code';

const SECRET = 'test-secret';
// Local noon on a day of the week starting Mon 2026-11-02 (week 0); tz-agnostic.
const at = (week: number, day: number) => new Date(2026, 10, 2 + week * 7 + day, 12).getTime();
const MON = 0, WED = 2, FRI = 4, SAT = 5, SUN = 6;

let t: TestDb;
let learnerId: number;
beforeEach(() => {
  t = makeTestDb();
  learnerId = createLearner(t.db, 'bonus', {}, at(0, MON)).id;
});
afterEach(() => t.cleanup());

/** A one-question story, finished (complete + answered) at `now` unless `answer` is false. */
function read(now: number, answer = true): number {
  const story: StoryJson = { title: 't', body: '好', targetCharsUsed: [], comprehensionQuestions: [{ q: '好吗', options: ['好', '不'], answer: 0, testsChars: ['好'] }], choices: [], glossary: [] };
  const meta = { model: 'm', repairIterations: 0, knownCoverage: 1, targetCoverage: 1, perSentenceMin: 1, fallbackUsed: false, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, latencyMs: 0 } satisfies GenerationMeta;
  const storyId = createStory(t.db, { learnerId, story, meta, segments: [], now }).id;
  recordCompletion(t.db, { storyId, learnerId, now });
  if (answer) recordInteraction(t.db, { storyId, learnerId, char: '好', type: 'question_correct', value: 0, now });
  return storyId;
}

const readDays = (week: number, days: number[]) => days.forEach((d) => read(at(week, d)));

describe('weekly bonus', () => {
  test('fixture weeks start on Monday', () => {
    expect(new Date(at(0, MON)).getDay()).toBe(1);
  });

  test('all 5 weekdays → 60, 3 → 30, 2 → 0', () => {
    readDays(0, [0, 1, 2, 3, 4]);
    expect(getBonusStatus(t.db, learnerId, at(0, SAT))?.pending).toEqual({ weeks: ['2026-11-02'], minutes: 60 });
    readDays(1, [MON, WED, FRI]);
    readDays(2, [MON, WED]);
    expect(getBonusStatus(t.db, learnerId, at(2, SAT))?.pending).toEqual({ weeks: ['2026-11-02', '2026-11-09'], minutes: 90 });
  });

  test('unanswered stories and weekend reading do not count; two stories on one day = one day', () => {
    read(at(0, MON), false);
    read(at(0, SAT));
    read(at(0, SUN));
    readDays(0, [WED, WED, FRI]);
    expect(getBonusStatus(t.db, learnerId, at(0, SUN))?.thisWeek).toMatchObject({ daysRead: ['2026-11-04', '2026-11-06'], minutes: 0 });
  });

  test('a story deleted after reading still counts', () => {
    readDays(0, [MON, WED]);
    softDeleteStory(t.db, read(at(0, FRI)));
    expect(finishedDays(t.db, learnerId).size).toBe(3);
  });

  test('claim refused on weekdays, minted on the weekend, then nothing pending', () => {
    readDays(0, [0, 1, 2, 3, 4]);
    expect(claimWeeklyBonus(t.db, learnerId, 'jayden', SECRET, at(0, FRI))).toEqual({ error: expect.stringContaining('Saturday') });
    const claim = claimWeeklyBonus(t.db, learnerId, ' Jayden ', SECRET, at(0, SAT));
    if ('error' in claim) throw new Error(claim.error);
    expect(claim).toMatchObject({ kid: 'jayden', minutes: 60, weeks: ['2026-11-02'] });
    const [mins, nonce, sig] = claim.code.split('-');
    expect(mins).toBe('60');
    expect(sig).toBe(sign(SECRET, 'jayden', 60, nonce));
    expect(getLearner(t.db, learnerId)?.settings.bonusClaims).toEqual([claim]);
    expect(claimWeeklyBonus(t.db, learnerId, 'jayden', SECRET, at(0, SUN))).toEqual({ error: expect.stringContaining('No weekly bonus') });
    expect(getBonusStatus(t.db, learnerId, at(0, SUN))?.lastClaim).toEqual(claim);
  });

  test('unclaimed weeks carry over; more than 240 min splits across claims', () => {
    for (let w = 0; w < 5; w++) readDays(w, [0, 1, 2, 3, 4]); // 5 × 60 = 300
    const first = claimWeeklyBonus(t.db, learnerId, 'amelia', SECRET, at(4, SAT));
    expect(first).toMatchObject({ minutes: 240, weeks: ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'] });
    expect(claimWeeklyBonus(t.db, learnerId, 'amelia', SECRET, at(4, SAT))).toMatchObject({ minutes: 60, weeks: ['2026-11-30'] });
  });
});
