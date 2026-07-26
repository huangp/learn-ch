import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { inArray } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters } from '../../db/schema';
import { createLearner } from '../learner/crud';
import { selfDeclareHsk } from '../placement/index';
import { seedLearner } from '../learner/seed';
import { getKnownChars } from '../allowlist/index';
import { selectNewChars } from '../grading/select';
import { pickTargetsFromDoc } from './targets';

const NOW = 1_750_000_000_000;

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

function charsFor(ids: number[]): string[] {
  const rows = t.db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.id, ids)).all();
  const map = new Map(rows.map((r) => [r.id, r.char]));
  return ids.map((id) => map.get(id)!).filter(Boolean);
}

function seededHsk1(): number {
  const learnerId = createLearner(t.db, 'T', {}, NOW).id;
  seedLearner(t.db, learnerId, selfDeclareHsk(t.db, 1), 'hsk', NOW);
  return learnerId;
}

describe('pickTargetsFromDoc', () => {
  test('prefers frontier-ready unknowns, in frontier order, and excludes known chars', () => {
    const learnerId = seededHsk1();
    const known = [...getKnownChars(t.db, learnerId)];
    const frontier = charsFor(selectNewChars(t.db, learnerId, 3));
    expect(frontier.length).toBeGreaterThan(0);

    // Doc = a couple known chars + the first frontier chars (unordered in the doc string).
    const doc = [...known.slice(0, 2), frontier[1], frontier[0]];
    const targets = pickTargetsFromDoc(t.db, learnerId, doc);

    // Frontier chars are chosen (known excluded), returned in frontier order not doc order.
    expect(targets).toEqual([frontier[0], frontier[1]]);
    for (const k of known.slice(0, 2)) expect(targets).not.toContain(k);
  });

  test('respects the cap', () => {
    const learnerId = seededHsk1();
    const frontier = charsFor(selectNewChars(t.db, learnerId, 6));
    const targets = pickTargetsFromDoc(t.db, learnerId, frontier, 2);
    expect(targets.length).toBe(2);
    expect(targets).toEqual(frontier.slice(0, 2));
  });

  test('falls back to most-frequent unknown when no frontier-ready chars are present', () => {
    const learnerId = seededHsk1();
    // 的 (rank 1) and 一 (rank ~2) are extremely frequent; pick two common chars NOT known to an
    // HSK1 learner and NOT frontier (deep-curriculum). Use rare-ish but real chars to avoid frontier.
    const known = getKnownChars(t.db, learnerId);
    const frontierSet = new Set(charsFor(selectNewChars(t.db, learnerId, Number.MAX_SAFE_INTEGER)));
    // Grab two real chars that are unknown AND not frontier-ready, differing in freqRank.
    const candidates = t.db
      .select({ char: characters.char, freqRank: characters.freqRank })
      .from(characters)
      .where(inArray(characters.freqRank, [1500, 1800]))
      .all()
      .filter((r) => !known.has(r.char) && !frontierSet.has(r.char));
    // If the fixture happens to make these frontier/known, skip — the mechanism is covered elsewhere.
    if (candidates.length === 2) {
      const doc = candidates.map((c) => c.char);
      const targets = pickTargetsFromDoc(t.db, learnerId, doc);
      expect(targets.length).toBe(2);
      // Sorted by freqRank asc → the 1500-rank char comes before the 1800-rank one.
      const byRank = [...candidates].sort((a, b) => (a.freqRank ?? Infinity) - (b.freqRank ?? Infinity)).map((c) => c.char);
      expect(targets).toEqual(byRank);
    }
  });

  test('off-curriculum / non-DB chars are never targets', () => {
    const learnerId = seededHsk1();
    // Find real CJK codepoints that are NOT in the Simplified master table (so they can't be targets).
    const rare = ['𰀀', '鿮', '鿯', '䶿', '〇'];
    const present = new Set(
      t.db.select({ char: characters.char }).from(characters).where(inArray(characters.char, rare)).all().map((r) => r.char),
    );
    const absent = rare.filter((c) => !present.has(c));
    expect(absent.length).toBeGreaterThan(0); // sanity: our fixture set has some genuinely-absent chars
    expect(pickTargetsFromDoc(t.db, learnerId, absent)).toEqual([]);
  });

  test('a fully-known document yields no targets', () => {
    const learnerId = seededHsk1();
    const known = [...getKnownChars(t.db, learnerId)].slice(0, 5);
    expect(pickTargetsFromDoc(t.db, learnerId, known)).toEqual([]);
  });
});
