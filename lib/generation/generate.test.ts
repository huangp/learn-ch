import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils.js';
import { buildCurriculum } from '../grading/curriculum.js';
import { selfDeclareHsk } from '../placement/index.js';
import { createLearner } from '../learner/crud.js';
import { seedLearner } from '../learner/seed.js';
import { buildAllowlist } from '../allowlist/index.js';
import { MockLlmProvider } from '../llm/mock.js';
import { generateGradedStory } from './generate.js';
import { GenerationFailed } from './types.js';

const NOW = 1_750_000_000_000;

let t: TestDb;
let learnerId: number;
let targetCharIds: number[];
let cleanJson: string;
let dirtyJson: string;

beforeAll(() => {
  t = makeTestDb();
  learnerId = createLearner(t.db, 'Gen', {}, NOW).id;
  const known = selfDeclareHsk(t.db, 3);
  seedLearner(t.db, learnerId, known, 'hsk', NOW);
  const knownSet = new Set(known);
  targetCharIds = buildCurriculum(t.db).filter((id) => !knownSet.has(id)).slice(0, 1);

  // Build a passing body from the actual allowlist: two known-char-dense sentences,
  // the target woven in once per sentence (≥K=2, spread → not clustered).
  const { allowedChars, targetChars } = buildAllowlist(t.db, learnerId, targetCharIds);
  const target = targetChars[0];
  const knownChars = [...allowedChars].filter((c) => c !== target);
  const [k1, k2] = knownChars;
  const cleanBody = `${k1.repeat(12)}${target}。${k2.repeat(12)}${target}。`;
  const story = (body: string) => ({
    title: `${k1}${k2}`,
    body,
    targetCharsUsed: [target],
    comprehensionQuestions: [],
    choices: [],
  });
  cleanJson = JSON.stringify(story(cleanBody));
  // Dirty: same shape but with an out-of-vocab Han char (龘) injected.
  dirtyJson = JSON.stringify(story(`${k1.repeat(12)}龘${target}。${k2.repeat(12)}${target}。`));
});
afterAll(() => t.cleanup());

describe('generateGradedStory — generate → validate → repair (§8.1)', () => {
  test('repairs a dirty first draft and returns the clean story', async () => {
    const llm = new MockLlmProvider([dirtyJson, cleanJson]);
    const res = await generateGradedStory(t.db, llm, learnerId, { targetCharIds });
    expect(res.meta.repairIterations).toBe(1);
    expect(res.meta.fallbackUsed).toBe(false);
    expect(llm.calls.length).toBe(2);
    expect(res.story.targetCharsUsed.length).toBe(1);
  });

  test('returns on a clean first pass with zero repairs', async () => {
    const llm = new MockLlmProvider([cleanJson]);
    const res = await generateGradedStory(t.db, llm, learnerId, { targetCharIds });
    expect(res.meta.repairIterations).toBe(0);
    expect(res.meta.fallbackUsed).toBe(false);
    expect(res.meta.knownCoverage).toBeGreaterThanOrEqual(0.9);
  });

  test('exhausts repairs, runs the fallback, then throws GenerationFailed', async () => {
    const llm = new MockLlmProvider(() => dirtyJson); // always dirty
    await expect(generateGradedStory(t.db, llm, learnerId, { targetCharIds, maxRepairs: 1 })).rejects.toBeInstanceOf(
      GenerationFailed,
    );
    // 1 initial + 1 repair + 1 fallback
    expect(llm.calls.length).toBe(3);
  });

  test('feeds the offending char into the repair prompt (§8.4)', async () => {
    const llm = new MockLlmProvider([dirtyJson, cleanJson]);
    await generateGradedStory(t.db, llm, learnerId, { targetCharIds });
    const repairTurn = llm.calls[1].messages.at(-1)!.content;
    expect(repairTurn).toContain('龘');
  });
});
