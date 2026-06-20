import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters } from '../../db/schema';
import { getStrokeData } from './strokes';

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

describe('getStrokeData', () => {
  test('parses the stored {strokes, medians} JSON for a known char', () => {
    const data = { strokes: ['M 1 2', 'M 3 4'], medians: [[[1, 2]], [[3, 4]]] };
    t.db.update(characters).set({ strokeData: JSON.stringify(data) }).where(eq(characters.char, '好')).run();
    expect(getStrokeData(t.db, '好')).toEqual(data);
  });

  test('returns null for an unknown char and for a null/empty column', () => {
    expect(getStrokeData(t.db, '\u{2A700}')).toBeNull(); // not in the DB
    t.db.update(characters).set({ strokeData: null }).where(eq(characters.char, '我')).run();
    expect(getStrokeData(t.db, '我')).toBeNull();
  });

  test('returns null on unparseable JSON rather than throwing', () => {
    t.db.update(characters).set({ strokeData: '{not json' }).where(eq(characters.char, '你')).run();
    expect(getStrokeData(t.db, '你')).toBeNull();
  });
});
