// §9 annotation — convert a CC-CEDICT word pinyin string (numbered tone, as stored in
// words.pinyin) into per-char toned pinyin. Used as the synchronous, deterministic
// correction layer for multi-char words matched in the lexicon.
//
//   "yin2 hang2" → ["yín","háng"]    "lu:3 xing2" → ["lǚ","xíng"]    "Bei3 jing1" → ["běi","jīng"]

import { convert } from 'pinyin-pro';

/**
 * Toned per-char pinyin for a CC-CEDICT word pinyin, or `null` if the syllable count
 * doesn't match `charCount` (erhua / multi-syllable glyphs can't be aligned char-by-char,
 * so the caller keeps pinyin-pro's reading).
 */
export function cedictToToned(cedictPinyin: string | null, charCount: number): string[] | null {
  if (!cedictPinyin) return null;
  const syllables = cedictPinyin.trim().split(/\s+/).filter(Boolean);
  if (syllables.length !== charCount) return null;
  // Normalize CC-CEDICT quirks before converting: proper nouns are capitalized; ü is
  // written "u:"; neutral tone is digit 5, which pinyin-pro's convert doesn't recognize
  // (it must be dropped so the syllable renders unmarked, e.g. "shi5" → "shi").
  return syllables.map((s) =>
    convert(s.toLowerCase().replace(/u:/g, 'v').replace(/5$/, ''), { format: 'numToSymbol' }),
  );
}
