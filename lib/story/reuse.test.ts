import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { selfDeclareHsk } from '../placement/index';
import { createLearner } from '../learner/crud';
import { seedLearner } from '../learner/seed';
import { selectNewChars } from '../grading/select';
import { buildAllowlist } from '../allowlist/index';
import { MockLlmProvider } from '../llm/mock';
import { users } from '../../db/schema';
import { generateAndPersistStory } from './generate';

const NOW = 1_750_000_000_000;

let t: TestDb;

/** Create an owner account (learners.ownerId FK → users.id) and return its id. */
function makeOwner(id: string): string {
  t.db.insert(users).values({ id, email: `${id}@example.com`, createdAt: NOW }).run();
  return id;
}

/**
 * Build a story body + JSON tuned to whatever target `selectNewChars` picks for the learner:
 * three known-dense sentences, the single target woven in once per sentence (≥K=3 with spread).
 */
function buildPassingJson(learnerId: number): { json: string; body: string; target: string } {
  const targetCharIds = selectNewChars(t.db, learnerId, 1);
  const { allowedChars, targetChars } = buildAllowlist(t.db, learnerId, targetCharIds);
  const target = targetChars[0];
  const [k1, k2] = [...allowedChars].filter((c) => c !== target);
  const body = `${k1.repeat(12)}${target}。${k2.repeat(12)}${target}。${k1.repeat(12)}${target}。`;
  const json = JSON.stringify({
    title: `${k1}${k2}`,
    body,
    targetCharsUsed: [target],
    comprehensionQuestions: [{ q: '?', options: ['a', 'b'], answer: 0, testsChars: [target] }],
    choices: [{ label: '继续', seed: 'go' }],
  });
  return { json, body, target };
}

/** An LLM that fails the test if it's ever called — proves a reuse path skipped generation. */
const noLlm = new MockLlmProvider(() => {
  throw new Error('LLM should not be called when a story is reused');
});

beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

describe('cross-learner story reuse', () => {
  test('reuses a sibling story (same account) with zero LLM calls', async () => {
    makeOwner('acct-hit');
    const a = createLearner(t.db, 'sibling-a', {}, NOW, 'acct-hit').id;
    seedLearner(t.db, a, selfDeclareHsk(t.db, 3), 'hsk', NOW);
    const { json, body, target } = buildPassingJson(a);
    const aStory = await generateAndPersistStory(t.db, new MockLlmProvider([json]), a, { targets: 1, due: 0, now: NOW });

    // B: same account, identical placement → A's story should fit.
    const b = createLearner(t.db, 'sibling-b', {}, NOW, 'acct-hit').id;
    seedLearner(t.db, b, selfDeclareHsk(t.db, 3), 'hsk', NOW);
    const bStory = await generateAndPersistStory(t.db, noLlm, b, { targets: 1, due: 0, now: NOW });

    expect(bStory.hanzi).toBe(body); // identical body, copied verbatim
    expect(bStory.targetChars).toEqual([target]); // recorded as B's own target
    expect(bStory.meta?.reusedFromStoryId).toBe(aStory.id);
    expect(bStory.meta?.reusedFromLearnerId).toBe(a);
    expect(bStory.meta?.reusedFromLearnerName).toBe('sibling-a'); // "comes from learner X" attribution
    expect(bStory.meta?.model).toBe('reuse');
    // segments carried over (annotation NOT re-run): they still join back to the body
    expect(bStory.segments.map((s) => s.text).join('')).toBe(body);
  });

  test('does NOT reuse across different parent accounts', async () => {
    makeOwner('acct-fam1');
    makeOwner('acct-fam2');
    const a = createLearner(t.db, 'fam1-a', {}, NOW, 'acct-fam1').id;
    seedLearner(t.db, a, selfDeclareHsk(t.db, 3), 'hsk', NOW);
    await generateAndPersistStory(t.db, new MockLlmProvider([buildPassingJson(a).json]), a, { targets: 1, due: 0, now: NOW });

    // B on a DIFFERENT account, identical placement → must generate fresh, never reuse A's.
    const b = createLearner(t.db, 'fam2-b', {}, NOW, 'acct-fam2').id;
    seedLearner(t.db, b, selfDeclareHsk(t.db, 3), 'hsk', NOW);
    const llmB = new MockLlmProvider([buildPassingJson(b).json]);
    const bStory = await generateAndPersistStory(t.db, llmB, b, { targets: 1, due: 0, now: NOW });

    expect(bStory.meta?.reusedFromStoryId).toBeUndefined();
    expect(bStory.meta?.model).not.toBe('reuse');
    expect(llmB.calls.length).toBeGreaterThanOrEqual(1); // it generated (≥1 LLM call)
  });

  test('reuse:false forces fresh generation even when a sibling story fits', async () => {
    makeOwner('acct-optout');
    const a = createLearner(t.db, 'optout-a', {}, NOW, 'acct-optout').id;
    seedLearner(t.db, a, selfDeclareHsk(t.db, 3), 'hsk', NOW);
    await generateAndPersistStory(t.db, new MockLlmProvider([buildPassingJson(a).json]), a, { targets: 1, due: 0, now: NOW });

    const b = createLearner(t.db, 'optout-b', {}, NOW, 'acct-optout').id;
    seedLearner(t.db, b, selfDeclareHsk(t.db, 3), 'hsk', NOW);
    const llmB = new MockLlmProvider([buildPassingJson(b).json]);
    const bStory = await generateAndPersistStory(t.db, llmB, b, { targets: 1, due: 0, reuse: false, now: NOW });

    expect(bStory.meta?.reusedFromStoryId).toBeUndefined();
    expect(bStory.meta?.model).not.toBe('reuse'); // fresh generation, not reuse
    expect(llmB.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('does NOT reuse a story too advanced for the learner', async () => {
    // A is HSK3; B (same account) is HSK1 — A's body uses chars B can't read and that aren't all
    // at B's frontier, so reuse must be rejected and B generates fresh.
    makeOwner('acct-adv');
    const a = createLearner(t.db, 'adv-a', {}, NOW, 'acct-adv').id;
    seedLearner(t.db, a, selfDeclareHsk(t.db, 3), 'hsk', NOW);
    await generateAndPersistStory(t.db, new MockLlmProvider([buildPassingJson(a).json]), a, { targets: 1, due: 0, now: NOW });

    const b = createLearner(t.db, 'adv-b', {}, NOW, 'acct-adv').id;
    seedLearner(t.db, b, selfDeclareHsk(t.db, 1), 'hsk', NOW);
    const llmB = new MockLlmProvider([buildPassingJson(b).json]);
    const bStory = await generateAndPersistStory(t.db, llmB, b, { targets: 1, due: 0, now: NOW });

    expect(bStory.meta?.reusedFromStoryId).toBeUndefined();
    expect(bStory.meta?.model).not.toBe('reuse'); // fresh generation, not reuse
    expect(llmB.calls.length).toBeGreaterThanOrEqual(1);
  });
});
