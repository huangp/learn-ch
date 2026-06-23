import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { createLearner } from '../learner/crud';
import type { AnnotatedSegment } from '../annotate/index';
import type { GenerationMeta, StoryJson } from '../generation/types';
import { createStory, listStoriesForLearner } from './persist';
import { flattenThread, getThreadContext, groupIntoThreads } from './thread';

const NOW = 1_750_000_000_000;

const story: StoryJson = {
  title: '故事',
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
];

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

function add(learnerId: number, parentStoryId: number | undefined, n: number): number {
  return createStory(t.db, { learnerId, story, meta, segments, parentStoryId, now: NOW + n }).id;
}

describe('groupIntoThreads', () => {
  test('a linear chain becomes one thread with ascending part numbers', () => {
    const learner = createLearner(t.db, 'chain', {}, NOW).id;
    const a = add(learner, undefined, 1);
    const b = add(learner, a, 2);
    const c = add(learner, b, 3);

    const { threads, singletons } = groupIntoThreads(listStoriesForLearner(t.db, learner));
    expect(singletons).toHaveLength(0);
    expect(threads).toHaveLength(1);

    const flat = flattenThread(threads[0]);
    expect(flat.map((n) => n.story.id)).toEqual([a, b, c]);
    expect(flat.map((n) => n.part)).toEqual([1, 2, 3]);
  });

  test('a fork yields two children sharing the same part number', () => {
    const learner = createLearner(t.db, 'fork', {}, NOW).id;
    const root = add(learner, undefined, 1);
    const left = add(learner, root, 2);
    const right = add(learner, root, 3);

    const { threads } = groupIntoThreads(listStoriesForLearner(t.db, learner));
    expect(threads).toHaveLength(1);
    expect(threads[0].part).toBe(1);
    const kids = threads[0].children;
    expect(kids.map((n) => n.story.id)).toEqual([left, right]); // oldest-first
    expect(kids.map((n) => n.part)).toEqual([2, 2]);
  });

  test('standalone stories are singletons, not threads', () => {
    const learner = createLearner(t.db, 'solo', {}, NOW).id;
    const a = add(learner, undefined, 1);
    const b = add(learner, undefined, 2);

    const { threads, singletons } = groupIntoThreads(listStoriesForLearner(t.db, learner));
    expect(threads).toHaveLength(0);
    expect(singletons.map((s) => s.id).sort()).toEqual([a, b].sort());
  });

  test('threads are ordered newest-first by their most recent story', () => {
    const learner = createLearner(t.db, 'order', {}, NOW).id;
    const oldRoot = add(learner, undefined, 1);
    add(learner, oldRoot, 2); // old thread's latest = NOW+2
    const newRoot = add(learner, undefined, 10);
    add(learner, newRoot, 11); // new thread's latest = NOW+11

    const { threads } = groupIntoThreads(listStoriesForLearner(t.db, learner));
    expect(threads.map((n) => n.story.id)).toEqual([newRoot, oldRoot]);
  });
});

describe('getThreadContext', () => {
  test('reports parent, children and part for a mid-chain story', () => {
    const learner = createLearner(t.db, 'ctx', {}, NOW).id;
    const a = add(learner, undefined, 1);
    const b = add(learner, a, 2);
    const c = add(learner, b, 3);

    const stories = listStoriesForLearner(t.db, learner);
    const ctx = getThreadContext(stories, b)!;
    expect(ctx.parent?.id).toBe(a);
    expect(ctx.children.map((s) => s.id)).toEqual([c]);
    expect(ctx.part).toBe(2);
  });

  test('a standalone story has no parent and no children', () => {
    const learner = createLearner(t.db, 'ctx-solo', {}, NOW).id;
    const a = add(learner, undefined, 1);
    const ctx = getThreadContext(listStoriesForLearner(t.db, learner), a)!;
    expect(ctx.parent).toBeNull();
    expect(ctx.children).toHaveLength(0);
    expect(ctx.part).toBe(1);
  });

  test('returns null for a story not in the list', () => {
    expect(getThreadContext([], 123)).toBeNull();
  });
});
