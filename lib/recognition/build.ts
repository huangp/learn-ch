import { and, asc, eq, inArray, isNotNull, like, ne } from 'drizzle-orm';
import { convert } from 'pinyin-pro';
import type { Db } from '../db';
import { characters, words } from '../../db/schema';
import { annotate } from '../annotate/index';
import { candidatesFor } from '../annotate/heteronym';
import { splitSentences } from '../annotate/segment';
import type { RecognitionItem } from '../generation/types';

// End-of-story character-recognition questions (组词造句 → pick pinyin + meaning). Deterministic,
// pure DB read. The word/sentence draft can be refined by an LLM (./refine.ts), but the options are
// always built here: pinyin from annotate() of the final sentence (context-aware, heteronym-safe),
// meaning from characters.gloss — never from the model.

const HAN = /\p{Script=Han}/u;
const OPTION_COUNT = 4;
/** Longer sentences are cut down to the clause holding the word, so the card stays readable. */
const MAX_SENTENCE_CHARS = 30;
/** Lexicon words fetched per char before filtering to the allowed set. */
const WORD_SCAN_LIMIT = 200;
/** Alternative words offered to the LLM refine pass. */
export const MAX_ALTERNATIVES = 5;

export interface RecognitionDraft {
  char: string;
  word: string;
  sentence: string;
  /** Other readable words containing the char (for the LLM refine pass). */
  alternatives: string[];
  source: 'deterministic' | 'llm';
}

/** Readable lexicon words (2–4 chars) containing `char`, most frequent first. */
function candidateWords(db: Db, char: string, allowed: Set<string>): string[] {
  const rows = db
    .select({ word: words.word })
    .from(words)
    .where(and(like(words.chars, `%"${char}"%`), isNotNull(words.freqRank)))
    .orderBy(asc(words.freqRank))
    .limit(WORD_SCAN_LIMIT)
    .all();
  return rows
    .map((r) => r.word)
    .filter((w) => {
      const cs = [...w];
      return cs.length >= 2 && cs.length <= 4 && cs.every((c) => c === char || allowed.has(c));
    });
}

/** Trim a sentence; when long, cut it to the clause holding `needle` so the card stays readable. */
function clip(sentence: string, needle: string): string {
  const s = sentence.trim();
  if ([...s].length <= MAX_SENTENCE_CHARS) return s;
  const clause = s.split(/(?<=[，、：])/u).find((c) => c.includes(needle));
  return (clause ?? s).trim();
}

/** The char's default reading (characters.pinyin[0]) — what its first gloss sense usually describes. */
function defaultReading(db: Db, char: string): string | null {
  const raw = db.select({ pinyin: characters.pinyin }).from(characters).where(eq(characters.char, char)).get()?.pinyin;
  try {
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;
  } catch {
    return null;
  }
}

/**
 * Deterministic 组词 + 造句 for one char. Sentence = a body sentence containing the char, preferring
 * one where it takes its default reading (so the gloss — usually that reading's sense — fits).
 * Word = the multi-char word the story itself uses there (annotate segmentation), else the most
 * frequent readable lexicon word.
 */
export function pickWordAndSentence(db: Db, char: string, body: string, allowed: Set<string>): RecognitionDraft {
  const cands = candidateWords(db, char, allowed);
  const dflt = defaultReading(db, char);
  const sentences = splitSentences(body)
    .map((s) => s.trim())
    .filter((s) => s.includes(char));
  const withDefault = sentences.filter((s) => readingInSentence(db, char, char, s) === dflt);
  // Only fall back to other-reading sentences when the char never takes its default reading.
  const pool = withDefault.length > 0 ? withDefault : sentences;
  const alternatives = (word: string) => cands.filter((w) => w !== word).slice(0, MAX_ALTERNATIVES);

  for (const s of pool) {
    const seg = annotate(db, s).find((g) => g.chars.length >= 2 && g.chars.includes(char) && g.chars.every((c) => c === char || allowed.has(c)));
    if (seg) return { char, word: seg.text, sentence: clip(s, seg.text), alternatives: alternatives(seg.text), source: 'deterministic' };
  }
  // No word in the story: a lexicon word where the char has the same reading as in the sentence.
  const sentence = pool[0] ? clip(pool[0], char) : null;
  const reading = sentence ? readingInSentence(db, char, char, sentence) : dflt;
  const word = cands.find((w) => readingInSentence(db, char, char, w) === reading) ?? cands[0] ?? char;
  return { char, word, sentence: sentence ?? word, alternatives: alternatives(word), source: 'deterministic' };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Fill to OPTION_COUNT distinct options (correct first in `pool` order), shuffle, return answer index. */
function toOptions(correct: string, pool: string[], rand: () => number): { options: string[]; answer: number } | null {
  const opts = [correct];
  for (const p of pool) {
    if (opts.length >= OPTION_COUNT) break;
    if (p && !opts.includes(p)) opts.push(p);
  }
  if (opts.length < 2) return null;
  const shuffled = shuffle(opts, rand);
  return { options: shuffled, answer: shuffled.indexOf(correct) };
}

/** Same syllable, other tones (incl. neutral): hái → hāi, hǎi, hài, hai. */
function toneVariants(toned: string): string[] {
  const base = convert(toned, { format: 'symbolToNum' }).replace(/[0-5]$/, '');
  return [1, 2, 3, 4, 0].map((t) => convert(`${base}${t}`, { format: 'numToSymbol' })).filter((p) => p !== toned);
}

/** First sense(s) of a char gloss — "also, besides; still, yet; to return" → "also, besides". */
export function shortGloss(gloss: string | null): string | null {
  const first = gloss?.split(';')[0]?.trim();
  return first ? first : null;
}

/** The char's reading inside `sentence`, at the `word` occurrence (context-aware pinyin). */
export function readingInSentence(db: Db, char: string, word: string, sentence: string): string | null {
  const chars = [...sentence];
  const wordAt = sentence.indexOf(word);
  const charIdx = wordAt >= 0 ? [...sentence.slice(0, wordAt)].length + [...word].indexOf(char) : chars.indexOf(char);
  if (charIdx < 0) return null;
  let offset = 0;
  for (const seg of annotate(db, sentence)) {
    let p = 0;
    for (const c of seg.chars) {
      if (offset === charIdx) return HAN.test(c) ? seg.pinyin[p] ?? null : null;
      if (HAN.test(c)) p++;
      offset++;
    }
  }
  return null;
}

/**
 * Turn a draft into a full item: correct pinyin + 3 distractors (the char's other readings, then
 * tone variants), correct meaning + 3 distractors (glosses of `others`, then frequency neighbors).
 * Returns null when the char has no reading or gloss.
 */
export function finalizeItem(
  db: Db,
  draft: RecognitionDraft,
  others: string[],
  rand: () => number = Math.random,
): RecognitionItem | null {
  const row = db.select({ gloss: characters.gloss, freqRank: characters.freqRank }).from(characters).where(eq(characters.char, draft.char)).get();
  const gloss = shortGloss(row?.gloss ?? null);
  const pinyin = readingInSentence(db, draft.char, draft.word, draft.sentence);
  if (!gloss || !pinyin) return null;

  const pinyinOpts = toOptions(pinyin, [...candidatesFor(draft.char).filter((p) => p !== pinyin), ...toneVariants(pinyin)], rand);

  const otherGlosses = new Set<string>();
  const otherHan = [...new Set(others)].filter((c) => c !== draft.char && HAN.test(c));
  if (otherHan.length > 0) {
    for (const r of db.select({ char: characters.char, gloss: characters.gloss }).from(characters).where(inArray(characters.char, otherHan)).all()) {
      const g = shortGloss(r.gloss);
      if (g) otherGlosses.add(g);
    }
  }
  // Frequency neighbors as a backstop when the story has too few other glossed chars.
  const rank = row?.freqRank ?? 1000;
  const neighbors = db
    .select({ gloss: characters.gloss })
    .from(characters)
    .where(and(ne(characters.char, draft.char), isNotNull(characters.gloss), isNotNull(characters.freqRank)))
    .orderBy(asc(characters.freqRank))
    .limit(12)
    .offset(Math.max(0, rank - 6))
    .all()
    .map((r) => shortGloss(r.gloss))
    .filter((g): g is string => g != null);
  const meaningOpts = toOptions(gloss, shuffle([...otherGlosses], rand).concat(neighbors), rand);
  if (!pinyinOpts || !meaningOpts) return null;

  return {
    char: draft.char,
    word: draft.word,
    sentence: draft.sentence,
    pinyinOptions: pinyinOpts.options,
    pinyinAnswer: pinyinOpts.answer,
    meaningOptions: meaningOpts.options,
    meaningAnswer: meaningOpts.answer,
    source: draft.source,
  };
}

/** Deterministic drafts for every target char (input order). */
export function draftRecognition(db: Db, targets: string[], body: string, allowed: Set<string>): RecognitionDraft[] {
  return targets.map((c) => pickWordAndSentence(db, c, body, allowed));
}

/** Finalize drafts into items; distractor glosses come from the other targets + body chars. */
export function finalizeRecognition(
  db: Db,
  drafts: RecognitionDraft[],
  body: string,
  rand: () => number = Math.random,
): RecognitionItem[] {
  const others = [...drafts.map((d) => d.char), ...[...body].filter((c) => HAN.test(c))];
  return drafts.map((d) => finalizeItem(db, d, others, rand)).filter((i): i is RecognitionItem => i != null);
}

/** Fully deterministic recognition items (no LLM) — used for uploads and reuse clones. */
export function buildRecognitionItems(
  db: Db,
  targets: string[],
  body: string,
  allowed: Set<string>,
  rand: () => number = Math.random,
): RecognitionItem[] {
  return finalizeRecognition(db, draftRecognition(db, targets, body, allowed), body, rand);
}
