import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { charComponents, characters, words } from '../../db/schema';
import { getCharDetail, getWordDetail } from './detail';

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

/** A char that actually has component edges in the seeded DB. */
function aCharWithComponents(): string {
  const edge = t.db.select({ charId: charComponents.charId }).from(charComponents).get()!;
  return t.db.select({ char: characters.char }).from(characters).where(eq(characters.id, edge.charId)).get()!.char;
}

describe('getCharDetail', () => {
  test('returns pinyin, gloss and the component breakdown', () => {
    const char = aCharWithComponents();
    const detail = getCharDetail(t.db, char);
    expect(detail).not.toBeNull();
    expect(detail!.char).toBe(char);
    expect(detail!.pinyin.length).toBeGreaterThan(0);
    expect(detail!.components.length).toBeGreaterThan(0);
    for (const c of detail!.components) {
      expect(typeof c.char).toBe('string');
      expect(['semantic', 'phonetic', 'structural']).toContain(c.role);
    }
  });

  test('returns null for a char not in the master', () => {
    expect(getCharDetail(t.db, '\u{2A700}')).toBeNull();
  });
});

/** A two-character, glossed word from the lexicon whose chars both resolve in the master. */
function aTwoCharWord(): string {
  for (const r of t.db.select({ word: words.word, gloss: words.gloss }).from(words).limit(1000).all()) {
    const cs = [...r.word];
    if (r.gloss && cs.length === 2 && cs.every((c) => getCharDetail(t.db, c) != null)) return r.word;
  }
  throw new Error('no suitable two-char word in the seeded lexicon');
}

describe('getWordDetail (§8.5 / word-level reveal)', () => {
  test('returns word pinyin + gloss and a per-character breakdown', () => {
    const word = aTwoCharWord();
    const d = getWordDetail(t.db, word);
    expect(d.word).toBe(word);
    expect(d.gloss).not.toBeNull(); // lexicon words carry a gloss
    expect(d.chars.length).toBe(2);
    expect(d.chars.map((c) => c.char)).toEqual([...word]);
  });

  test('degrades to a single-char word', () => {
    const d = getWordDetail(t.db, '好');
    expect(d.word).toBe('好');
    expect(d.chars.length).toBe(1);
    expect(d.chars[0].char).toBe('好');
  });
});
