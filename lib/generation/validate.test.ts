import { describe, expect, test } from 'vitest';
import { validateChars } from './validate.js';

const allowed = new Set([...'我你好他是的木兰女马口']);

describe('validateChars (§8.2)', () => {
  test('all-allowed body passes with no violations', () => {
    const r = validateChars('你好。我是木兰！', allowed);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.evasions).toEqual([]);
  });

  test('records out-of-vocab Han chars with codepoint index', () => {
    const r = validateChars('我爱你', allowed); // 爱 not allowed
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual([{ char: '爱', index: 1 }]);
  });

  test('ignores whitespace, digits, ASCII and CJK punctuation', () => {
    const r = validateChars('我 好，123。你好！', allowed);
    expect(r.ok).toBe(true);
  });

  test('flags latin letters as evasion', () => {
    const r = validateChars('我hao你', allowed);
    expect(r.evasions.map((e) => e.char)).toEqual(['h', 'a', 'o']);
    expect(r.ok).toBe(false);
  });

  test('flags pinyin tone marks (precomposed and combining) as evasion', () => {
    const r = validateChars('好nǐ', allowed); // ǐ precomposed toned vowel + n latin
    expect(r.ok).toBe(false);
    expect(r.evasions.some((e) => e.char === 'ǐ')).toBe(true);
  });
});
