// §9 annotation — load the segmentation/gloss lexicon from the seeded DB. One scan of
// `words` (word → gloss) and one of `characters` (char → gloss, the single-char
// fallback), mirroring the full-table-scan pattern in lib/allowlist/index.ts.

import { characters, words } from '../../db/schema';
import type { Db } from '../db';
import type { Lexicon } from './segment';

export function loadLexicon(db: Db): Lexicon {
  const wordRows = db.select({ word: words.word, gloss: words.gloss, pinyin: words.pinyin }).from(words).all();
  const wordMap = new Map<string, { gloss: string | null; pinyin: string | null }>();
  let maxLen = 1;
  for (const r of wordRows) {
    wordMap.set(r.word, { gloss: r.gloss, pinyin: r.pinyin });
    const len = [...r.word].length;
    if (len > maxLen) maxLen = len;
  }

  const charRows = db.select({ char: characters.char, gloss: characters.gloss }).from(characters).all();
  const charGloss = new Map<string, string | null>();
  for (const r of charRows) charGloss.set(r.char, r.gloss);

  return { words: wordMap, charGloss, maxLen };
}
