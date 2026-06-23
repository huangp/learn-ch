import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { buildCurriculum } from '../grading/curriculum';
import { selfDeclareHsk } from '../placement/index';
import { createLearner } from '../learner/crud';
import { seedLearner } from '../learner/seed';
import { buildAllowlist } from '../allowlist/index';
import { MockLlmProvider } from '../llm/mock';
import { PERSONAS } from '../persona/presets';
import { generateGradedStory } from './generate';
import { GenerationFailed } from './types';

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

  test('exhausts repairs + fallback, then returns the best draft flagged belowTarget', async () => {
    const llm = new MockLlmProvider(() => dirtyJson); // always dirty (out-of-vocab 龘, strict learner)
    const res = await generateGradedStory(t.db, llm, learnerId, { targetCharIds, maxRepairs: 1 });
    // 1 initial + 1 repair + 1 fallback
    expect(llm.calls.length).toBe(3);
    expect(res.meta.belowTarget).toBe(true);
    expect(res.meta.shortfalls?.length ?? 0).toBeGreaterThan(0);
    expect(res.story.body).toContain('龘');
  });

  test('throws GenerationFailed only when no attempt parses into a story', async () => {
    const llm = new MockLlmProvider(() => 'not json at all'); // never parseable
    await expect(generateGradedStory(t.db, llm, learnerId, { targetCharIds, maxRepairs: 1 })).rejects.toBeInstanceOf(
      GenerationFailed,
    );
  });

  test('feeds the offending char into the repair prompt (§8.4)', async () => {
    const llm = new MockLlmProvider([dirtyJson, cleanJson]);
    await generateGradedStory(t.db, llm, learnerId, { targetCharIds });
    const repairTurn = llm.calls[1].messages.at(-1)!.content;
    expect(repairTurn).toContain('龘');
  });

  test('a story-seed name passes validation, beats reach the prompt, seedId in meta (§17.2)', async () => {
    const storySeed = {
      id: 'test-seed',
      title: '测试',
      titleEn: 'Test',
      blurb: '',
      setting: 'A test setting.',
      characters: ['魑魅 (a rare-named hero)'],
      beats: ['The hero sets out.', 'The hero returns.'],
      allowNames: ['魑魅'], // rare chars, not in the HSK3 allowlist — only the seed injection allows them
      source: 'authored' as const,
    };
    const { allowedChars, targetChars } = buildAllowlist(t.db, learnerId, targetCharIds);
    const target = targetChars[0];
    const [k1, k2] = [...allowedChars].filter((c) => c !== target);
    const body = `${k1.repeat(10)}魑魅${target}。${k2.repeat(10)}魑魅${target}。`;
    const json = JSON.stringify({ title: `${k1}${k2}`, body, targetCharsUsed: [target], comprehensionQuestions: [], choices: [] });

    const llm = new MockLlmProvider([json]);
    const res = await generateGradedStory(t.db, llm, learnerId, { targetCharIds, storySeed });
    expect(res.meta.repairIterations).toBe(0);
    expect(res.meta.seedId).toBe('test-seed');
    expect(res.story.body).toContain('魑魅');
    // the beats reached the user prompt
    const userPrompt = llm.calls[0].messages.at(-1)!.content;
    expect(userPrompt).toContain('STORY TO RETELL');
    expect(userPrompt).toContain('1. The hero sets out.');
  });

  test('small-vocabulary learner: an out-of-vocab char within budget passes (relaxed mode)', async () => {
    // HSK1 (< RELAX_KNOWN_THRESHOLD known chars) → relaxed: out-of-vocab chars are tolerated
    // up to the distinct-unknown budget instead of failing validateChars.
    const smallId = createLearner(t.db, 'Small', {}, NOW).id;
    const known = selfDeclareHsk(t.db, 1);
    seedLearner(t.db, smallId, known, 'hsk', NOW);
    const knownSet = new Set(known);
    const tIds = buildCurriculum(t.db).filter((id) => !knownSet.has(id)).slice(0, 1);

    const { allowedChars, targetChars } = buildAllowlist(t.db, smallId, tIds);
    const target = targetChars[0];
    const [k1, k2] = [...allowedChars].filter((c) => c !== target);
    // 龘 is NOT in the allowlist; relaxed mode permits it (distinct unknown = {target, 龘} = 2 ≤ 10).
    const body = `${k1.repeat(10)}龘${target}。${k2.repeat(10)}${target}。`;
    const json = JSON.stringify({ title: `${k1}${k2}`, body, targetCharsUsed: [target], comprehensionQuestions: [], choices: [] });

    const res = await generateGradedStory(t.db, new MockLlmProvider([json]), smallId, { targetCharIds: tIds });
    expect(res.meta.repairIterations).toBe(0);
    expect(res.meta.belowTarget).toBeFalsy();
    expect(res.story.body).toContain('龘');
  });

  test('a companion name passes validation and is recorded in meta (§11)', async () => {
    const persona = PERSONAS[0]; // 小龙
    const { allowedChars, targetChars } = buildAllowlist(t.db, learnerId, targetCharIds);
    const target = targetChars[0];
    const [k1, k2] = [...allowedChars].filter((c) => c !== target);
    // body uses the companion name (chars not otherwise in the allowlist) — only the persona
    // injection makes this pass validateChars.
    const body = `${k1.repeat(10)}${persona.name}${target}。${k2.repeat(10)}${persona.name}${target}。`;
    const json = JSON.stringify({ title: `${k1}${k2}`, body, targetCharsUsed: [target], comprehensionQuestions: [], choices: [] });

    const res = await generateGradedStory(t.db, new MockLlmProvider([json]), learnerId, { targetCharIds, persona });
    expect(res.meta.repairIterations).toBe(0);
    expect(res.meta.personaId).toBe(persona.id);
    // the companion directive reached the prompt
    expect(res.story.body).toContain(persona.name);
  });
});
