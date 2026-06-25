import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { interactions, learnerChars } from '../../db/schema';
import { createLearner } from '../learner/crud';
import type { GenerationMeta, StoryJson } from '../generation/types';
import { createStory } from '../story/persist';
import { gradeStory } from '../srs/grade';
import { recordCompletion } from './record';
import { getStoryReadCounts } from './stats';

const NOW = 1_750_000_000_000;

function makeStory(t: TestDb, learnerId: number, body = '好'): number {
  const story: StoryJson = { title: 't', body, targetCharsUsed: [], comprehensionQuestions: [], choices: [], glossary: [] };
  const meta = { model: 'm', repairIterations: 0, knownCoverage: 1, targetCoverage: 1, perSentenceMin: 1, fallbackUsed: false, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, latencyMs: 0 } satisfies GenerationMeta;
  return createStory(t.db, { learnerId, story, meta, segments: [], now: NOW }).id;
}

let t: TestDb;
let learnerId: number;
beforeAll(() => {
  t = makeTestDb();
  learnerId = createLearner(t.db, 'stats', {}, NOW).id;
});
afterAll(() => t.cleanup());

describe('getStoryReadCounts', () => {
  test('is empty when no readings have been concluded', () => {
    const storyId = makeStory(t, learnerId);
    expect(getStoryReadCounts(t.db, learnerId).get(storyId)).toBeUndefined();
  });

  test('counts one per recorded completion, isolated per story', () => {
    const a = makeStory(t, learnerId);
    const b = makeStory(t, learnerId);
    recordCompletion(t.db, { storyId: a, learnerId, now: NOW });
    recordCompletion(t.db, { storyId: a, learnerId, now: NOW + 1 });
    recordCompletion(t.db, { storyId: b, learnerId, now: NOW });
    const counts = getStoryReadCounts(t.db, learnerId);
    expect(counts.get(a)).toBe(2);
    expect(counts.get(b)).toBe(1);
  });

  test('does not count another learner’s completions', () => {
    const other = createLearner(t.db, 'stats-other', {}, NOW).id;
    const storyId = makeStory(t, other);
    recordCompletion(t.db, { storyId, learnerId: other, now: NOW });
    expect(getStoryReadCounts(t.db, learnerId).get(storyId)).toBeUndefined();
    expect(getStoryReadCounts(t.db, other).get(storyId)).toBe(1);
  });
});

describe('recordCompletion', () => {
  test('writes a story-level row (null charId) that is inert for FSRS grading', () => {
    const storyId = makeStory(t, learnerId, '好');
    recordCompletion(t.db, { storyId, learnerId, now: NOW });
    const row = t.db.select().from(interactions).where(eq(interactions.storyId, storyId)).get()!;
    expect(row.type).toBe('complete');
    expect(row.charId).toBeNull();

    // grading a story whose only interaction is a completion touches no learner_chars rows.
    const before = t.db.select().from(learnerChars).where(eq(learnerChars.learnerId, learnerId)).all().length;
    gradeStory(t.db, learnerId, storyId, NOW);
    const after = t.db.select().from(learnerChars).where(eq(learnerChars.learnerId, learnerId)).all().length;
    expect(after).toBe(before);
  });
});
