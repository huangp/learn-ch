// §9 annotation — the pinyin pass. pinyin-pro segments a whole sentence internally
// to resolve heteronyms by context (行 háng/xíng, 重 zhòng/chóng, 长 zhǎng/cháng),
// so this MUST be called per sentence, not per word. The result is aligned 1:1 with
// the sentence's codepoints; segmentation/gloss is a separate pass (segment.ts) and
// the two are zipped by char offset in index.ts.

import { pinyin } from 'pinyin-pro';

const HAN = /\p{Script=Han}/u;

/**
 * Context-aware pinyin for one sentence, one toned-pinyin string per Han char and
 * `null` for every non-Han char (punctuation/digits/latin), aligned 1:1 with
 * `[...sentence]`.
 */
export function perCharPinyin(sentence: string): (string | null)[] {
  // nonZh:'removed' makes pinyin-pro emit exactly one toned token per Han char, in
  // order, dropping non-Han entirely. Heteronym resolution happens before this
  // formatting, so context is preserved. Do NOT pass { heteronym: true } — that
  // returns *all* readings instead of the context-selected one.
  const toned = pinyin(sentence, { type: 'array', toneType: 'symbol', nonZh: 'removed' });

  const chars = [...sentence];
  const hanCount = chars.reduce((n, c) => n + (HAN.test(c) ? 1 : 0), 0);
  if (toned.length !== hanCount) {
    throw new Error(
      `pinyin alignment mismatch: ${toned.length} pinyin vs ${hanCount} Han chars in ${JSON.stringify(sentence)}`,
    );
  }

  const out: (string | null)[] = [];
  let p = 0;
  for (const c of chars) out.push(HAN.test(c) ? toned[p++] : null);
  return out;
}
