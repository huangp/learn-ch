// Phase 4 — Annotation layer (§9). Deterministic pass turning a validated hanzi-only
// story body into render-ready segments (word boundaries + per-char pinyin + gloss).
// Pure read; writes nothing — persisting to stories.annotated is Phase 5.
//
// Per-char pinyin is resolved by a layered chain (this module covers the synchronous
// tiers; the opt-in async LLM tier lives in ./llm.ts):
//   1. pinyin-pro  — context-aware, per sentence
//   2. cedict      — for a matched multi-char word, prefer curated words.pinyin
// Each char also carries its candidate readings (heteronym detection) + provenance.

import type { Db } from '../db';
import { cedictToToned } from './cedict';
import { candidatesFor } from './heteronym';
import { loadLexicon } from './lexicon';
import { perCharPinyin } from './pinyin';
import { segmentText, splitSentences } from './segment';

export type PinyinSource = 'pinyin-pro' | 'cedict' | 'llm';

export interface AnnotatedSegment {
  text: string;
  /** per-char toned pinyin (["yín","háng"]); empty for punctuation/non-Han. */
  pinyin: string[];
  /** word gloss (CC-CEDICT), single-char gloss fallback, or null. */
  gloss: string | null;
  chars: string[];
  /** per Han char: all valid readings (pinyin-pro multiple); length > 1 ⇒ heteronym. */
  candidates: string[][];
  /** per Han char: where the chosen pinyin came from. */
  source: PinyinSource[];
}

/** Annotate a hanzi-only body into render-ready segments. `join` of texts === body. */
export function annotate(db: Db, hanzi: string): AnnotatedSegment[] {
  if (hanzi.length === 0) return [];
  const lex = loadLexicon(db);

  // 1. Per-char pinyin, computed per sentence for heteronym context, concatenated into
  //    a body-level array aligned 1:1 with [...hanzi].
  const perChar: (string | null)[] = [];
  for (const sentence of splitSentences(hanzi)) perChar.push(...perCharPinyin(sentence));

  // 2. Word/punctuation segmentation over the whole body. Han runs never cross
  //    punctuation, so segments align with the per-sentence pinyin offsets.
  const segs = segmentText(hanzi, lex);

  // 3. Resolve pinyin per char (pinyin-pro → cedict), attach gloss + detection metadata.
  return segs.map((seg) => {
    const chars = [...seg.text];
    const entry = lex.words.get(seg.text);
    const gloss = entry?.gloss ?? (chars.length === 1 ? lex.charGloss.get(seg.text) ?? null : null);

    // CC-CEDICT toned readings for a matched multi-char word (null if misaligned/missing).
    const cedict = chars.length >= 2 && entry ? cedictToToned(entry.pinyin, chars.length) : null;

    const pinyin: string[] = [];
    const candidates: string[][] = [];
    const source: PinyinSource[] = [];
    for (let k = 0; k < chars.length; k++) {
      const pp = perChar[seg.start + k];
      if (pp == null) continue; // non-Han char: no pinyin/candidates/source
      const cands = candidatesFor(chars[k]);
      let chosen = pp;
      let src: PinyinSource = 'pinyin-pro';
      // Prefer CC-CEDICT only when it diverges and is a valid reading for this char
      // (guards against pinyin-pro/CC-CEDICT charset mismatches).
      const ce = cedict?.[k];
      if (ce && ce !== pp && cands.includes(ce)) {
        chosen = ce;
        src = 'cedict';
      }
      pinyin.push(chosen);
      candidates.push(cands);
      source.push(src);
    }

    return { text: seg.text, pinyin, gloss, chars, candidates, source };
  });
}
