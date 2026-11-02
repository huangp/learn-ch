import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { inArray } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters } from '../../db/schema';
import { selfDeclareHsk } from '../placement/index';
import { buildRecognitionItems, pickWordAndSentence, shortGloss } from './build';

const BODY = '小明去图书馆还书。他还想看一本新书。朋友说，这本书非常好看，我们一起去吧！';
const TARGETS = ['还', '馆', '非'];

let t: TestDb;
let allowed: Set<string>;
beforeAll(() => {
  t = makeTestDb();
  const ids = selfDeclareHsk(t.db, 2);
  const known = t.db.select({ c: characters.char }).from(characters).where(inArray(characters.id, ids)).all().map((r) => r.c);
  allowed = new Set([...known, ...TARGETS]);
});
afterAll(() => t.cleanup());

// Deterministic "random" for stable option order.
const rand = () => 0.42;

describe('pickWordAndSentence', () => {
  test('uses the word the story itself segments, in the sentence it appears in', () => {
    const d = pickWordAndSentence(t.db, '馆', BODY, allowed);
    expect(d.word).toBe('图书馆');
    expect(d.sentence).toBe('小明去图书馆还书。');
    expect(d.source).toBe('deterministic');
  });

  test('prefers a sentence where a heteronym takes its default reading (还 hái, not 还书 huán)', () => {
    const d = pickWordAndSentence(t.db, '还', BODY, allowed);
    expect(d.sentence).toBe('他还想看一本新书。');
    expect(d.word).toContain('还');
    expect([...d.word].every((c) => c === '还' || allowed.has(c))).toBe(true);
  });
});

describe('buildRecognitionItems', () => {
  test('one item per target with 4 distinct options and a correct answer index', () => {
    const items = buildRecognitionItems(t.db, TARGETS, BODY, allowed, rand);
    expect(items.map((i) => i.char)).toEqual(TARGETS);
    for (const i of items) {
      expect(i.word).toContain(i.char);
      expect(new Set(i.pinyinOptions).size).toBe(4);
      expect(new Set(i.meaningOptions).size).toBe(4);
      expect(i.pinyinOptions[i.pinyinAnswer]).toBeDefined();
      expect(i.meaningOptions[i.meaningAnswer]).toBeDefined();
    }
    const guan = items.find((i) => i.char === '馆')!;
    expect(guan.pinyinOptions[guan.pinyinAnswer]).toBe('guǎn');
    const hai = items.find((i) => i.char === '还')!;
    expect(hai.pinyinOptions[hai.pinyinAnswer]).toBe('hái');
    expect(hai.meaningOptions[hai.meaningAnswer]).toBe(shortGloss('also, besides; still, yet; to return'));
  });

  test('skips a char with no gloss / not in the DB', () => {
    expect(buildRecognitionItems(t.db, ['ꙮ'], BODY, allowed, rand)).toEqual([]);
  });
});
