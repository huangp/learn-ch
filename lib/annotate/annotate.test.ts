import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils.js';
import { annotate } from './index.js';
import { perCharPinyin } from './pinyin.js';
import { type Lexicon, segmentText, splitSentences } from './segment.js';

const HAN = /\p{Script=Han}/u;

describe('perCharPinyin — heteronyms resolve by context (§9 acceptance)', () => {
  test('行 háng vs xíng', () => {
    expect(perCharPinyin('银行')).toEqual(['yín', 'háng']);
    expect(perCharPinyin('旅行')).toEqual(['lǚ', 'xíng']);
  });
  test('重 chóng vs zhòng', () => {
    expect(perCharPinyin('重复')).toEqual(['chóng', 'fù']);
    expect(perCharPinyin('很重')).toEqual(['hěn', 'zhòng']);
  });
  test('长 zhǎng vs cháng', () => {
    expect(perCharPinyin('长大')).toEqual(['zhǎng', 'dà']);
    expect(perCharPinyin('很长')).toEqual(['hěn', 'cháng']);
  });
  test('还 huán vs hái', () => {
    expect(perCharPinyin('归还')).toEqual(['guī', 'huán']);
    expect(perCharPinyin('还是')).toEqual(['hái', 'shì']);
  });

  test('punctuation/non-Han → null, aligned 1:1 with chars', () => {
    expect(perCharPinyin('你好，世界')).toEqual(['nǐ', 'hǎo', null, 'shì', 'jiè']);
  });
});

describe('splitSentences — lossless, keeps delimiters', () => {
  test('splits on sentence-end punctuation, concatenation reconstructs body', () => {
    const body = '木兰是女孩。她很勇敢！对吗？';
    expect(splitSentences(body)).toEqual(['木兰是女孩。', '她很勇敢！', '对吗？']);
    expect(splitSentences(body).join('')).toBe(body);
  });
  test('trailing fragment without a delimiter is kept', () => {
    expect(splitSentences('木兰')).toEqual(['木兰']);
  });
});

describe('segmentText — greedy longest-match (pure, literal lexicon)', () => {
  const lex: Lexicon = {
    words: new Map([
      ['木兰', { gloss: 'Mulan', pinyin: null }],
      ['女孩', { gloss: 'girl', pinyin: 'nv3 hai2' }],
      ['以前', { gloss: 'before', pinyin: 'yi3 qian2' }],
    ]),
    charGloss: new Map<string, string | null>([['很', 'very']]),
    maxLen: 2,
  };

  test('matches multi-char words; punctuation is its own segment', () => {
    const segs = segmentText('以前，木兰是女孩', lex);
    expect(segs.map((s) => s.text)).toEqual(['以前', '，', '木兰', '是', '女孩']);
    expect(segs.map((s) => s.start)).toEqual([0, 2, 3, 5, 6]);
  });

  test('unmatched Han chars fall back to single-char segments', () => {
    const segs = segmentText('很高', lex); // 高 not in lexicon
    expect(segs.map((s) => s.text)).toEqual(['很', '高']);
  });

  test('a match never spans into punctuation', () => {
    // "兰，" is not a word and the window contains punctuation → 兰 stays single.
    const segs = segmentText('木兰，', lex);
    expect(segs.map((s) => s.text)).toEqual(['木兰', '，']);
  });
});

describe('annotate — end to end against the seeded DB', () => {
  let t: TestDb;
  beforeAll(() => {
    t = makeTestDb();
  });
  afterAll(() => t.cleanup());

  const body = '很久以前，有一个女孩，名字叫木兰。';

  test('empty body → []', () => {
    expect(annotate(t.db, '')).toEqual([]);
  });

  test('reconstruction invariant: join of segment text equals body', () => {
    const segs = annotate(t.db, body);
    expect(segs.map((s) => s.text).join('')).toBe(body);
  });

  test('every Han char has pinyin; punctuation has none', () => {
    for (const seg of annotate(t.db, body)) {
      const allHan = [...seg.text].every((c) => HAN.test(c));
      if (allHan) {
        expect(seg.pinyin).toHaveLength(seg.chars.length);
        expect(seg.pinyin.every((p) => p.length > 0)).toBe(true);
      } else {
        // segmentText emits each non-Han char as its own segment
        expect(seg.pinyin).toEqual([]);
      }
    }
  });

  test('segmentation finds multi-char words and attaches a gloss', () => {
    const segs = annotate(t.db, body);
    const multi = segs.filter((s) => s.chars.length >= 2);
    expect(multi.length).toBeGreaterThan(0);
    expect(multi.some((s) => s.gloss != null)).toBe(true);
  });

  test('detection metadata: candidates + source align with pinyin per Han char', () => {
    for (const seg of annotate(t.db, body)) {
      expect(seg.candidates).toHaveLength(seg.pinyin.length);
      expect(seg.source).toHaveLength(seg.pinyin.length);
      // each char's chosen pinyin is one of its enumerated candidate readings
      seg.pinyin.forEach((p, k) => {
        expect(seg.candidates[k]).toContain(p);
        expect(['pinyin-pro', 'cedict', 'llm']).toContain(seg.source[k]);
      });
    }
  });
});
