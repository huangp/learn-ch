import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { createLearner } from '../learner/crud';
import type { GenerationMeta, StoryJson } from '../generation/types';
import { createStory } from '../story/persist';
import { recordCompletion } from '../interactions/record';
import { getReadingActivity } from './index';

const NOW = 1_750_000_000_000;
const DAY = 86_400_000;

// Same local-day formatting getReadingActivity buckets by, so tests are tz-agnostic.
function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeStory(t: TestDb, learnerId: number, body: string): number {
  const story: StoryJson = { title: 't', body, targetCharsUsed: [], comprehensionQuestions: [], choices: [], glossary: [] };
  const meta = { model: 'm', repairIterations: 0, knownCoverage: 1, targetCoverage: 1, perSentenceMin: 1, fallbackUsed: false, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, latencyMs: 0 } satisfies GenerationMeta;
  return createStory(t.db, { learnerId, story, meta, segments: [], now: NOW }).id;
}

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

describe('getReadingActivity', () => {
  test('is empty when nothing has been read', () => {
    const learnerId = createLearner(t.db, 'empty', {}, NOW).id;
    makeStory(t, learnerId, '好你'); // generated but never completed
    expect(getReadingActivity(t.db, learnerId)).toEqual([]);
  });

  test('buckets completed stories by day with unique/total/time metrics', () => {
    const learnerId = createLearner(t.db, 'reader', {}, NOW).id;
    const a = makeStory(t, learnerId, '好好你'); // Han: 好,好,你 → total 3, unique 2
    const b = makeStory(t, learnerId, '我'); // total 1, unique 1

    recordCompletion(t.db, { storyId: a, learnerId, now: NOW });
    recordCompletion(t.db, { storyId: b, learnerId, now: NOW + 2 * DAY });

    const activity = getReadingActivity(t.db, learnerId);
    expect(activity.map((d) => d.date)).toEqual([localDay(NOW), localDay(NOW + 2 * DAY)]); // ascending

    const day1 = activity[0];
    expect(day1).toMatchObject({ storiesRead: 1, uniqueChars: 2, totalChars: 3, readingMinutes: 1 });
    const day2 = activity[1];
    expect(day2).toMatchObject({ storiesRead: 1, uniqueChars: 1, totalChars: 1, readingMinutes: 1 });
  });

  test('re-reading the same day counts again (engagement view)', () => {
    const learnerId = createLearner(t.db, 'rereader', {}, NOW).id;
    const s = makeStory(t, learnerId, '好你'); // total 2, unique 2
    recordCompletion(t.db, { storyId: s, learnerId, now: NOW });
    recordCompletion(t.db, { storyId: s, learnerId, now: NOW + 1000 }); // same day

    const [day] = getReadingActivity(t.db, learnerId);
    expect(day).toMatchObject({ storiesRead: 2, uniqueChars: 2, totalChars: 4 });
  });
});
