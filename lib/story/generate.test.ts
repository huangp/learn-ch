import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { selfDeclareHsk } from '../placement/index';
import { createLearner } from '../learner/crud';
import { seedLearner } from '../learner/seed';
import { selectNewChars } from '../grading/select';
import { buildAllowlist } from '../allowlist/index';
import { gradeUngradedStories } from '../srs/grade';
import { MockLlmProvider } from '../llm/mock';
import { getStory, listStoriesForLearner } from './persist';
import { generateAndPersistStory } from './generate';

const NOW = 1_750_000_000_000;

let t: TestDb;

/**
 * Build a story body + JSON tuned to whatever target `selectNewChars` currently picks for the
 * learner (targets:1) — two known-dense sentences, the single target woven in once per sentence
 * (≥K spread). Because Phase 7 catch-up grading advances the frontier between generations, the
 * target is recomputed per call rather than fixed.
 */
function buildPassingJson(learnerId: number): { json: string; body: string; target: string } {
  const targetCharIds = selectNewChars(t.db, learnerId, 1);
  const { allowedChars, targetChars } = buildAllowlist(t.db, learnerId, targetCharIds);
  const target = targetChars[0];
  const [k1, k2] = [...allowedChars].filter((c) => c !== target);
  const body = `${k1.repeat(12)}${target}。${k2.repeat(12)}${target}。`;
  const json = JSON.stringify({
    title: `${k1}${k2}`,
    body,
    targetCharsUsed: [target],
    comprehensionQuestions: [{ q: '?', options: ['a', 'b'], answer: 0, testsChars: [target] }],
    choices: [{ label: '继续', seed: 'go' }],
  });
  return { json, body, target };
}

beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

describe('generateAndPersistStory', () => {
  test('generates, annotates and persists a readable story', async () => {
    const learnerId = createLearner(t.db, 'gen-persist', {}, NOW).id;
    seedLearner(t.db, learnerId, selfDeclareHsk(t.db, 3), 'hsk', NOW);
    const { json, body, target } = buildPassingJson(learnerId);

    const llm = new MockLlmProvider([json]);
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
    const learnerId = createLearner(t.db, 'gen-branch', {}, NOW).id;
    seedLearner(t.db, learnerId, selfDeclareHsk(t.db, 3), 'hsk', NOW);

    const parent = await generateAndPersistStory(t.db, new MockLlmProvider([buildPassingJson(learnerId).json]), learnerId, {
      targets: 1,
      due: 0,
      now: NOW,
    });

    // Grade the parent (as the child's internal catch-up will) so its target is promoted and we
    // can build the child's body for the NEW target the next generation will select.
    gradeUngradedStories(t.db, learnerId, NOW);

    const child = await generateAndPersistStory(t.db, new MockLlmProvider([buildPassingJson(learnerId).json]), learnerId, {
      targets: 1,
      due: 0,
      parentStoryId: parent.id,
      priorStory: parent.hanzi,
      seed: 'mulan-goes',
      now: NOW + 1,
    });
    expect(child.parentStoryId).toBe(parent.id);
    // the chosen branch seed is persisted on the story's meta (no schema migration)
    expect(child.meta?.branchSeed).toBe('mulan-goes');
    expect(getStory(t.db, child.id)?.meta?.branchSeed).toBe('mulan-goes');
    expect(listStoriesForLearner(t.db, learnerId).some((s) => s.id === child.id)).toBe(true);
  });
});
