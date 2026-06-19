import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils.js';
import { characters, words } from '../../db/schema.js';
import { buildCurriculum, computeFrontier } from '../grading/curriculum.js';
import { selfDeclareHsk } from '../placement/index.js';
import { createLearner } from '../learner/crud.js';
import { seedLearner } from '../learner/seed.js';
import { buildAllowlist, DEFAULT_MAX_WORDS } from './index.js';

const NOW = 1_750_000_000_000;

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

/** First `n` curriculum chars past the learner's frontier that aren't already known. */
function frontierTargets(known: number[], n: number): number[] {
  const order = buildCurriculum(t.db);
  const knownSet = new Set(known);
  return order.filter((id) => !knownSet.has(id)).slice(0, n);
}

function charOf(id: number): string {
  return t.db.select({ char: characters.char }).from(characters).where(eq(characters.id, id)).get()!.char;
}

describe('buildAllowlist — HSK3 learner', () => {
  let learnerId: number;
  let known: number[];
  let targets: number[];

  beforeAll(() => {
    learnerId = createLearner(t.db, 'Allow', {}, NOW).id;
    known = selfDeclareHsk(t.db, 3);
    seedLearner(t.db, learnerId, known, 'hsk', NOW);
    targets = frontierTargets(known, 3);
  });

  test('every allowed word decomposes entirely into allowedChars (§7 acceptance a)', () => {
    const { allowedChars, allowedWords } = buildAllowlist(t.db, learnerId, targets);
    expect(allowedWords.length).toBeGreaterThan(0);
    for (const w of allowedWords) {
      for (const c of w.word) expect(allowedChars.has(c)).toBe(true);
    }
  });

  test('known chars and targets are all in allowedChars', () => {
    const { allowedChars, targetChars } = buildAllowlist(t.db, learnerId, targets);
    for (const id of known) expect(allowedChars.has(charOf(id))).toBe(true);
    for (const tc of targetChars) expect(allowedChars.has(tc)).toBe(true);
    expect(targetChars).toEqual(targets.map(charOf));
  });

  test('allowedWords sorted by freqRank ascending, nulls last', () => {
    const { allowedWords } = buildAllowlist(t.db, learnerId, targets);
    const ranks = allowedWords.map((w) => w.freqRank ?? Infinity);
    // sorted is only guaranteed over the capped head; coverage backfill appends at the tail,
    // so check the capped prefix.
    const head = ranks.slice(0, DEFAULT_MAX_WORDS);
    for (let i = 1; i < head.length; i++) expect(head[i]).toBeGreaterThanOrEqual(head[i - 1]);
  });

  test('respects the maxWords cap (modulo target-coverage backfill)', () => {
    const { allowedWords } = buildAllowlist(t.db, learnerId, targets, { maxWords: 50 });
    // cap + at most one backfilled word per target
    expect(allowedWords.length).toBeLessThanOrEqual(50 + targets.length);
  });
});

describe('buildAllowlist — target coverage (§7 acceptance b)', () => {
  test('every target with a usable example word is covered, even under a tiny cap', () => {
    const learnerId = createLearner(t.db, 'Cover', {}, NOW).id;
    const known = selfDeclareHsk(t.db, 2);
    seedLearner(t.db, learnerId, known, 'hsk', NOW);
    const targets = frontierTargets(known, 5);

    // force the cap to bite so coverage relies on the backfill, not luck
    const { allowedChars, allowedWords } = buildAllowlist(t.db, learnerId, targets, { maxWords: 1 });

    const allWords = t.db.select({ word: words.word }).from(words).all();
    const usable = allWords.filter((w) => [...w.word].every((c) => allowedChars.has(c)));

    for (const id of targets) {
      const tc = charOf(id);
      const hasUsableExample = usable.some((w) => w.word.includes(tc));
      if (!hasUsableExample) continue; // nothing the lexicon can offer; not the builder's fault
      const covered = allowedWords.some((w) => w.word.includes(tc));
      expect(covered).toBe(true);
    }
  });
});

describe('buildAllowlist — bootstrap / empty known set (§16.4)', () => {
  test('zero known + targets yields only target-composed words and does not throw', () => {
    const learnerId = createLearner(t.db, 'Boot', {}, NOW).id;
    seedLearner(t.db, learnerId, [], 'zero', NOW); // no learner_chars written
    const targets = buildCurriculum(t.db).slice(0, 2);

    const { allowedChars, allowedWords } = buildAllowlist(t.db, learnerId, targets);
    expect(allowedChars.size).toBe(2);
    for (const w of allowedWords) {
      for (const c of w.word) expect(allowedChars.has(c)).toBe(true);
    }
  });
});
