import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, eq, lte, isNotNull, gt, inArray } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils.js';
import { characters } from '../../db/schema.js';
import { selfDeclareHsk, fromPastedText, fromToggleGrid, fromZero } from './index.js';

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

describe('selfDeclareHsk', () => {
  test('returns exactly the chars at or below the declared level', () => {
    const expected = t.db
      .select({ id: characters.id })
      .from(characters)
      .where(and(isNotNull(characters.hskLevel), lte(characters.hskLevel, 1)))
      .all().length;
    expect(selfDeclareHsk(t.db, 1).length).toBe(expected);
  });

  test('HSK3 is a strict superset of HSK1', () => {
    const h1 = new Set(selfDeclareHsk(t.db, 1));
    const h3 = new Set(selfDeclareHsk(t.db, 3));
    expect(h3.size).toBeGreaterThan(h1.size);
    for (const id of h1) expect(h3.has(id)).toBe(true);
  });

  test("'none' yields an empty set", () => {
    expect(selfDeclareHsk(t.db, 'none')).toEqual([]);
  });
});

describe('fromPastedText', () => {
  test('keeps matching Simplified chars; drops Traditional / latin / emoji / dups silently', () => {
    const input = '我你好 们們 abc 😀\n好'; // 好 duplicated; 們 traditional; latin+emoji noise
    const distinctHan = [...new Set([...'我你好们們'])];
    const inDb = t.db
      .select({ char: characters.char })
      .from(characters)
      .where(inArray(characters.char, distinctHan))
      .all()
      .map((r) => r.char);

    const res = fromPastedText(t.db, input);
    expect(res.foundCount).toBe(inDb.length); // accurate count for the §16.1 confirmation
    expect(res.knownCharIds.length).toBe(res.foundCount);
    expect(res.foundCount).toBeLessThanOrEqual(distinctHan.length); // non-matches dropped
  });

  test('empty / non-CJK input yields an empty result without error', () => {
    expect(fromPastedText(t.db, 'hello 123 !!! 😀').foundCount).toBe(0);
    expect(fromPastedText(t.db, '').knownCharIds).toEqual([]);
  });
});

describe('fromToggleGrid', () => {
  test('bulk cutoff selects all chars at or below the freq rank', () => {
    const expected = t.db
      .select({ id: characters.id })
      .from(characters)
      .where(and(isNotNull(characters.freqRank), lte(characters.freqRank, 100)))
      .all().length;
    expect(fromToggleGrid(t.db, { cutoffFreqRank: 100 }).length).toBe(expected);
  });

  test('fine known/unknown overrides adjust the bulk set', () => {
    // a char above the cutoff (to add) and one at/below it (to remove)
    const above = t.db
      .select({ char: characters.char })
      .from(characters)
      .where(and(isNotNull(characters.freqRank), gt(characters.freqRank, 100)))
      .limit(1)
      .get()!;
    const below = t.db
      .select({ id: characters.id, char: characters.char })
      .from(characters)
      .where(and(isNotNull(characters.freqRank), lte(characters.freqRank, 100)))
      .limit(1)
      .get()!;

    const result = new Set(
      fromToggleGrid(t.db, { cutoffFreqRank: 100, known: [above.char], unknown: [below.char] }),
    );
    const aboveId = t.db.select({ id: characters.id }).from(characters).where(eq(characters.char, above.char)).get()!.id;

    expect(result.has(aboveId)).toBe(true); // fine "known" added despite being above cutoff
    expect(result.has(below.id)).toBe(false); // fine "unknown" removed despite being below cutoff
  });
});

test('fromZero is empty', () => {
  expect(fromZero()).toEqual([]);
});
