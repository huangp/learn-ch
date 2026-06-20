import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { createLearner } from '../learner/crud';
import type { AnnotatedSegment } from '../annotate/index';
import type { GenerationMeta, StoryJson } from '../generation/types';
import { createStory, getStory, listStoriesForLearner } from './persist';

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
