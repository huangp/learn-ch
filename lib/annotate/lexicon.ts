// §9 annotation — load the segmentation/gloss lexicon from the seeded DB. One scan of
// `words` (word → gloss) and one of `characters` (char → gloss, the single-char
// fallback), mirroring the full-table-scan pattern in lib/allowlist/index.ts.

import { characters, words } from '../../db/schema';
import type { Db } from '../db';
import type { Lexicon } from './segment';

// The lexicon is built from `words`/`characters`, which are static at runtime (written only by
// `pnpm data:build`, never by the running app). So cache the built Lexicon per db handle — a full
// scan of ~120k words + ~8k chars would otherwise re-run on every annotate() call. Keyed by db
// (not a module global) so vitest's per-test makeTestDb databases each get their own entry.
const lexiconCache = new WeakMap<Db, Lexicon>();

export function loadLexicon(db: Db): Lexicon {
  const cached = lexiconCache.get(db);
  if (cached) return cached;
  const lexicon = buildLexicon(db);
  lexiconCache.set(db, lexicon);
  return lexicon;
}

function buildLexicon(db: Db): Lexicon {
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
