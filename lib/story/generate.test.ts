import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { selfDeclareHsk } from '../placement/index';
import { createLearner } from '../learner/crud';
import { seedLearner } from '../learner/seed';
import { selectNewChars } from '../grading/select';
import { buildAllowlist } from '../allowlist/index';
import { MockLlmProvider } from '../llm/mock';
import { getStory, listStoriesForLearner } from './persist';
import { generateAndPersistStory } from './generate';

const NOW = 1_750_000_000_000;

let t: TestDb;
let learnerId: number;
let cleanJson: string;
let target: string;
let body: string;

beforeAll(() => {
  t = makeTestDb();
  learnerId = createLearner(t.db, 'gen-persist', {}, NOW).id;
  seedLearner(t.db, learnerId, selfDeclareHsk(t.db, 3), 'hsk', NOW);

  // Replicate what the wrapper picks for targets:1 / due:0, then build a passing body
  // (two known-dense sentences, the single target woven in once per sentence → ≥K spread).
  const targetCharIds = selectNewChars(t.db, learnerId, 1);
  const { allowedChars, targetChars } = buildAllowlist(t.db, learnerId, targetCharIds);
  target = targetChars[0];
  const [k1, k2] = [...allowedChars].filter((c) => c !== target);
  body = `${k1.repeat(12)}${target}。${k2.repeat(12)}${target}。`;
  cleanJson = JSON.stringify({
    title: `${k1}${k2}`,
    body,
    targetCharsUsed: [target],
    comprehensionQuestions: [{ q: '?', options: ['a', 'b'], answer: 0, testsChars: [target] }],
    choices: [{ label: '继续', seed: 'go' }],
  });
});
afterAll(() => t.cleanup());

describe('generateAndPersistStory', () => {
  test('generates, annotates and persists a readable story', async () => {
    const llm = new MockLlmProvider([cleanJson]);
    const rec = await generateAndPersistStory(t.db, llm, learnerId, { targets: 1, due: 0, now: NOW });

    expect(rec.id).toBeGreaterThan(0);
    expect(rec.hanzi).toBe(body);
    expect(rec.targetChars).toEqual([target]);
    expect(rec.questions.length).toBe(1);
    expect(rec.choices.length).toBe(1);
    // annotation ran: segments join back to the body
    expect(rec.segments.map((s) => s.text).join('')).toBe(body);
    // it was actually written
    expect(getStory(t.db, rec.id)).not.toBeNull();
  });

  test('records parentStoryId for a branch continuation', async () => {
    const parent = await generateAndPersistStory(t.db, new MockLlmProvider([cleanJson]), learnerId, { targets: 1, due: 0, now: NOW });
    const child = await generateAndPersistStory(t.db, new MockLlmProvider([cleanJson]), learnerId, {
      targets: 1,
      due: 0,
      parentStoryId: parent.id,
      priorStory: parent.hanzi,
      now: NOW + 1,
    });
    expect(child.parentStoryId).toBe(parent.id);
    expect(listStoriesForLearner(t.db, learnerId).some((s) => s.id === child.id)).toBe(true);
  });
});
