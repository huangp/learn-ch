// §9 annotation — the segmentation pass (pure; no DB). Greedy longest-match against
// the lexicon (seeded `words` table, CC-CEDICT-backed) so each word segment maps
// directly to an existing gloss. Han runs are matched into the longest known word;
// everything else (punctuation/digits/latin) becomes its own single-char segment.

const HAN = /\p{Script=Han}/u;

export interface WordEntry {
  /** CC-CEDICT gloss (may be null). */
  gloss: string | null;
  /** CC-CEDICT pinyin (numbered tone, e.g. "yin2 hang2"; may be null) — the cedict layer. */
  pinyin: string | null;
}

export interface Lexicon {
  /** word → its CC-CEDICT entry. Includes single-char words. */
  words: Map<string, WordEntry>;
  /** single char → gloss; fallback when a Han char isn't part of any matched word. */
  charGloss: Map<string, string | null>;
  /** longest word length (in codepoints) present in `words` — caps the match window. */
  maxLen: number;
}

export interface Segment {
  /** codepoint offset within the input where this segment starts. */
  start: number;
  text: string;
}

/** Sentence-end punctuation — split here so the pinyin pass gets sentence context. */
const SENTENCE_END = /[。！？；…\n]/u;

/**
 * Split a body into sentences, keeping each delimiter attached to its sentence.
 * Lossless: `splitSentences(b).join('') === b`.
 */
export function splitSentences(body: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of body) {
    cur += ch;
    if (SENTENCE_END.test(ch)) {
      out.push(cur);
      cur = '';
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Segment a body into word / single-char segments. Greedy longest-match: at each Han
 * position take the longest word in `lex` (≤ maxLen, and entirely Han so a match never
 * spans punctuation); otherwise emit the single char. Non-Han chars are their own
 * segments. Lossless: the segments' text concatenated equals `body`.
 *
 * No freqRank tiebreak is needed — `words` keys are unique, so for a given start there
 * is at most one word of each length, and longest-match is unambiguous.
 */
export function segmentText(body: string, lex: Lexicon): Segment[] {
  const chars = [...body];
  const segs: Segment[] = [];
  let i = 0;
  while (i < chars.length) {
    if (!HAN.test(chars[i])) {
      segs.push({ start: i, text: chars[i] });
      i++;
      continue;
    }
    let matched = '';
    const maxL = Math.min(lex.maxLen, chars.length - i);
    for (let L = maxL; L >= 2; L--) {
      const window = chars.slice(i, i + L);
      if (!window.every((c) => HAN.test(c))) continue; // don't span into punctuation
      const cand = window.join('');
      if (lex.words.has(cand)) {
        matched = cand;
        break;
      }
    }
    if (matched) {
      segs.push({ start: i, text: matched });
      i += [...matched].length;
    } else {
      segs.push({ start: i, text: chars[i] });
      i++;
    }
  }
  return segs;
}
