import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { onboardLearner } from '../learner/onboard';
import { characters, learnerChars } from '../../db/schema';
import { getKnownInventory } from './index';

const NOW = 1_750_000_000_000;

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

describe('getKnownInventory', () => {
  test('groups by HSK level, colors chars by mastery, derives word colors', () => {
    const learner = onboardLearner(t.db, { name: 'hsk3', method: 'hsk', hsk: 3, now: NOW });
    let inv = getKnownInventory(t.db, learner.id);

    // Levels ascending; level 7 is the HSK 7-9 band, the rest are plain.
    expect(inv.map((l) => l.level)).toEqual([...inv.map((l) => l.level)].sort((a, b) => a - b));
    for (const l of inv) expect(l.label).toBe(l.level === 7 ? 'HSK 7–9' : `HSK ${l.level}`);

    // Seeded known chars are all `review` → yellow; nothing mastered yet → no green; the
    // curriculum is larger than what's known → some grey.
    const chars = inv.flatMap((l) => l.chars);
    expect(chars.some((c) => c.color === 'yellow')).toBe(true);
    expect(chars.every((c) => c.color !== 'green')).toBe(true);
    expect(chars.some((c) => c.color === 'grey')).toBe(true);

    // Promote one known (yellow) char to mastered → it turns green.
    const target = chars.find((c) => c.color === 'yellow')!.text;
    const row = t.db.select({ id: characters.id }).from(characters).where(eq(characters.char, target)).get()!;
    t.db
      .update(learnerChars)
      .set({ status: 'mastered' })
      .where(and(eq(learnerChars.learnerId, learner.id), eq(learnerChars.charId, row.id)))
      .run();

    inv = getKnownInventory(t.db, learner.id);
    expect(inv.flatMap((l) => l.chars).find((c) => c.text === target)!.color).toBe('green');

    // Each word's color is consistent with its characters: any grey → grey; all green →
    // green; else yellow. (Skip words with a char outside the HSK char set we can see.)
    const charColor = new Map(inv.flatMap((l) => l.chars).map((c) => [c.text, c.color] as const));
    for (const w of inv.flatMap((l) => l.words)) {
      const glyphs = [...w.text];
      if (!glyphs.every((ch) => charColor.has(ch))) continue;
      const colors = glyphs.map((ch) => charColor.get(ch)!);
      const expected = colors.includes('grey') ? 'grey' : colors.every((c) => c === 'green') ? 'green' : 'yellow';
      expect(w.color).toBe(expected);
    }
  });
});
