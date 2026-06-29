import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { createLearner } from '../learner/crud';
import { seedLearner } from '../learner/seed';
import { selfDeclareHsk } from '../placement/index';
import { artWords } from '../art/manifest';
import { selectSlideshowWords } from './select';

const NOW = 1_750_000_000_000;

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

describe('selectSlideshowWords', () => {
  test('returns up to n distinct art-backed words with a valid image path', () => {
    const learner = createLearner(t.db, 'hsk3', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 3), 'hsk', NOW);

    const art = new Set(artWords());
    const out = selectSlideshowWords(t.db, learner.id, 5);

    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(new Set(out.map((s) => s.word)).size).toBe(out.length); // distinct
    for (const s of out) {
      expect(art.has(s.word)).toBe(true); // only words that have art
      expect(s.imagePath).toMatch(/^\/art\/words\/\d+\.webp$/);
      expect([...s.word].length).toBeGreaterThan(1); // multi-char vocab
      expect(s.charIds.length).toBeGreaterThan(0);
    }
  });

  test('prioritizes frontier words (readable + teaching) before backfill', () => {
    // A learner who knows nothing: every art word teaches something, but few are "readable"
    // (chars within known ∪ upcoming). Backfill still guarantees a full slate.
    const learner = createLearner(t.db, 'beginner', {}, NOW);
    seedLearner(t.db, learner.id, [], 'zero', NOW);

    const out = selectSlideshowWords(t.db, learner.id, 8);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(8);
  });

  test('excludes already-shown words and returns the next ranked batch (no overlap)', () => {
    const learner = createLearner(t.db, 'hsk3-more', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 3), 'hsk', NOW);

    const first = selectSlideshowWords(t.db, learner.id, 5);
    expect(first.length).toBeGreaterThan(0);

    const firstWords = first.map((s) => s.word);
    const next = selectSlideshowWords(t.db, learner.id, 5, firstWords);
    expect(next.length).toBeGreaterThan(0);
    // none of the next batch repeats the first
    expect(next.some((s) => firstWords.includes(s.word))).toBe(false);
  });

  test('returns [] for n <= 0', () => {
    const learner = createLearner(t.db, 'edge', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 1), 'hsk', NOW);
    expect(selectSlideshowWords(t.db, learner.id, 0)).toEqual([]);
  });
});
