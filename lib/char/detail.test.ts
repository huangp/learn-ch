import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { charComponents, characters } from '../../db/schema';
import { getCharDetail } from './detail';

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
