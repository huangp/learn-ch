import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { createLearner } from '../learner/crud';
import type { AnnotatedSegment } from '../annotate/index';
import type { GenerationMeta, StoryJson } from '../generation/types';
import { createStory, getStory, hardDeleteStory, listStoriesForLearner, softDeleteStory } from './persist';
import { recordCompletion } from '../interactions/record';
import { getStoryReadCounts } from '../interactions/stats';
import { gradeUngradedStories } from '../srs/grade';
import { canAccessStory } from '../auth/access';

const NOW = 1_750_000_000_000;

let t: TestDb;
let learnerId: number;
beforeAll(() => {
  t = makeTestDb();
  learnerId = createLearner(t.db, 'persist', {}, NOW).id;
});
afterAll(() => t.cleanup());

const story: StoryJson = {
  title: '测试',
  body: '你好。',
  targetCharsUsed: ['好'],
  comprehensionQuestions: [{ q: '谁好？', options: ['你', '他'], answer: 0, testsChars: ['好'] }],
  choices: [{ label: '继续', seed: 'next' }],
  glossary: [],
};
const meta: GenerationMeta = {
  model: 'mock',
  repairIterations: 1,
  knownCoverage: 0.95,
  targetCoverage: 1,
  perSentenceMin: 0.9,
  fallbackUsed: false,
  usage: { inputTokens: 10, outputTokens: 20 },
  costUsd: 0,
  latencyMs: 0,
};
const segments: AnnotatedSegment[] = [
  { text: '你好', pinyin: ['nǐ', 'hǎo'], gloss: 'hello', chars: ['你', '好'], candidates: [['nǐ'], ['hǎo']], source: ['pinyin-pro', 'pinyin-pro'] },
  { text: '。', pinyin: [], gloss: null, chars: ['。'], candidates: [], source: [] },
];

describe('createStory / getStory', () => {
  test('round-trips segments, questions, choices, meta and char lists', () => {
    const { id } = createStory(t.db, { learnerId, story, meta, segments, dueChars: ['是'], theme: 'greeting', now: NOW });
    const rec = getStory(t.db, id);
    expect(rec).not.toBeNull();
    expect(rec!.title).toBe('测试');
    expect(rec!.hanzi).toBe('你好。');
    expect(rec!.segments).toEqual(segments);
    expect(rec!.questions).toEqual(story.comprehensionQuestions);
    expect(rec!.choices).toEqual(story.choices);
    expect(rec!.targetChars).toEqual(['好']);
    expect(rec!.dueCharsUsed).toEqual(['是']);
    expect(rec!.theme).toBe('greeting');
    expect(rec!.parentStoryId).toBeNull();
    expect(rec!.meta?.knownCoverage).toBe(0.95);
    expect(rec!.createdAt).toBe(NOW);
  });

  test('persists parentStoryId for branch continuations', () => {
    const parent = createStory(t.db, { learnerId, story, meta, segments, now: NOW });
    const child = createStory(t.db, { learnerId, story, meta, segments, parentStoryId: parent.id, now: NOW + 1 });
    expect(getStory(t.db, child.id)!.parentStoryId).toBe(parent.id);
  });

  test('getStory returns null for a missing id', () => {
    expect(getStory(t.db, 999_999)).toBeNull();
  });
});

describe('listStoriesForLearner', () => {
  test('returns the learner\'s stories newest-first', () => {
    const learner = createLearner(t.db, 'lister', {}, NOW).id;
    const a = createStory(t.db, { learnerId: learner, story, meta, segments, now: NOW + 100 });
    const b = createStory(t.db, { learnerId: learner, story, meta, segments, now: NOW + 200 });
    const list = listStoriesForLearner(t.db, learner);
    expect(list.map((s) => s.id)).toEqual([b.id, a.id]);
  });
});

describe('softDeleteStory', () => {
  test('hides the story from the learner (list + getStory) but keeps its stats', () => {
    const learner = createLearner(t.db, 'soft-delete', {}, NOW).id;
    const keep = createStory(t.db, { learnerId: learner, story, meta, segments, now: NOW + 1 });
    const drop = createStory(t.db, { learnerId: learner, story, meta, segments, now: NOW + 2 });
    // a read of the soon-to-be-deleted story (a stat that must survive)
    recordCompletion(t.db, { storyId: drop.id, learnerId: learner, now: NOW + 3 });

    expect(softDeleteStory(t.db, drop.id, NOW + 4)).toBe(true);

    // hidden from learner-facing reads
    expect(getStory(t.db, drop.id)).toBeNull();
    expect(listStoriesForLearner(t.db, learner).map((s) => s.id)).toEqual([keep.id]);

    // stats kept: the completion still counts
    expect(getStoryReadCounts(t.db, learner).get(drop.id)).toBe(1);
  });

  test('is idempotent (re-deleting returns false)', () => {
    const learner = createLearner(t.db, 'soft-delete-idem', {}, NOW).id;
    const s = createStory(t.db, { learnerId: learner, story, meta, segments, now: NOW });
    expect(softDeleteStory(t.db, s.id, NOW + 1)).toBe(true);
    expect(softDeleteStory(t.db, s.id, NOW + 2)).toBe(false);
  });

  test('a deleted story is inaccessible (canAccessStory false) but still gradeable', () => {
    const learner = createLearner(t.db, 'soft-delete-access', {}, NOW).id;
    const s = createStory(t.db, { learnerId: learner, story, meta, segments, now: NOW });
    const ctx = { kind: 'child' as const, learnerId: learner };
    expect(canAccessStory(t.db, ctx, s.id)).toBe(true);
    softDeleteStory(t.db, s.id, NOW + 1);
    expect(canAccessStory(t.db, ctx, s.id)).toBe(false);
    // catch-up grading still sees deleted stories, so progress is preserved
    expect(gradeUngradedStories(t.db, learner, NOW + 2)).toBeGreaterThanOrEqual(1);
  });
});

describe('hardDeleteStory (adult permanent delete)', () => {
  test('removes the row and cascade-deletes its interactions (stats go too)', () => {
    const learner = createLearner(t.db, 'hard-delete', {}, NOW).id;
    const s = createStory(t.db, { learnerId: learner, story, meta, segments, now: NOW });
    recordCompletion(t.db, { storyId: s.id, learnerId: learner, now: NOW + 1 });
    expect(getStoryReadCounts(t.db, learner).get(s.id)).toBe(1);

    expect(hardDeleteStory(t.db, s.id)).toBe(true);

    // gone entirely — and its interactions cascaded away (unlike soft delete, which keeps them)
    expect(getStory(t.db, s.id)).toBeNull();
    expect(getStoryReadCounts(t.db, learner).get(s.id)).toBeUndefined();
    expect(hardDeleteStory(t.db, s.id)).toBe(false); // already gone
  });
});
