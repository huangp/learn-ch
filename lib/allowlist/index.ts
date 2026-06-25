import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters, learnerChars, words } from '../../db/schema';

// Phase 2 — Allowlist builder (§7). The generation engine is constrained by a
// word-level allowlist, not a char list (§2.1): LLMs follow "use only these words"
// far better. Given a learner's known chars ∪ the new target chars, return the
// char-level set (for Phase 3's validateChars) and the frequency-ranked, capped
// vocabulary actually handed to the model.

// Default size of the word list given to the LLM (the §7 context-window budget).
// Provisional — tune in the Phase 3 eval (§15 open decision #6).
export const DEFAULT_MAX_WORDS = 600;

// Statuses that count as "known" vocabulary the learner can already read (§7).
const KNOWN_STATUSES = ['learning', 'review', 'mastered'] as const;

/** The Han chars a learner can already read (learner_chars status learning/review/mastered). */
export function getKnownChars(db: Db, learnerId: number): Set<string> {
  const rows = db
    .select({ char: characters.char })
    .from(learnerChars)
    .innerJoin(characters, eq(learnerChars.charId, characters.id))
    .where(and(eq(learnerChars.learnerId, learnerId), inArray(learnerChars.status, [...KNOWN_STATUSES])))
    .all();
  return new Set(rows.map((r) => r.char));
}

export interface AllowedWord {
  word: string;
  pinyin: string | null;
  gloss: string | null;
  freqRank: number | null;
  hskLevel: number | null;
}

export interface Allowlist {
  /** Han chars the story may use: known ∪ target. Punctuation/digits are handled by Phase 3's validateChars. */
  allowedChars: Set<string>;
  /** Resolved target char strings (for the prompt's "use these new characters" list). */
  targetChars: string[];
  /** Vocabulary for the LLM: every char ∈ allowedChars, sorted by freqRank asc (nulls last), capped at maxWords. */
  allowedWords: AllowedWord[];
}

/**
 * Build the char + word allowlists for a learner about to receive a story
 * introducing `targetCharIds` (charIds, consistent with curriculum/placement/seed).
 */
export function buildAllowlist(
  db: Db,
  learnerId: number,
  targetCharIds: number[],
  opts: { maxWords?: number } = {},
): Allowlist {
  const maxWords = opts.maxWords ?? DEFAULT_MAX_WORDS;

  // 1. Known chars: learner_chars (learning/review/mastered) → characters.char.
  const knownChars = getKnownChars(db, learnerId);

  // 2. Target chars: resolve ids → strings, preserving the caller's order (curriculum order).
  const targetRows =
    targetCharIds.length === 0
      ? []
      : db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.id, targetCharIds)).all();
  const idToChar = new Map(targetRows.map((r) => [r.id, r.char]));
  const targetChars = targetCharIds.map((id) => idToChar.get(id)).filter((c): c is string => c != null);

  // 3. allowedChars = known ∪ target.
  const allowedChars = new Set<string>([...knownChars, ...targetChars]);

  // 4. Filter the lexicon to words whose every char is allowed (full in-memory scan).
  const allWords = db
    .select({
      word: words.word,
      pinyin: words.pinyin,
      gloss: words.gloss,
      freqRank: words.freqRank,
      hskLevel: words.hskLevel,
    })
    .from(words)
    .all();
  const usable = allWords.filter((w) => [...w.word].every((c) => allowedChars.has(c)));

  // 5. Sort by freqRank asc (nulls last), cap at maxWords.
  const byFreq = (a: AllowedWord, b: AllowedWord) =>
    (a.freqRank ?? Infinity) - (b.freqRank ?? Infinity);
  usable.sort(byFreq);
  const allowedWords = usable.slice(0, maxWords);

  // 6. Guarantee each target char has ≥1 example word (§7 acceptance). If the freq
  //    cap excluded every word containing a target, pull back its best example.
  const covered = new Set<string>();
  for (const w of allowedWords) for (const c of w.word) covered.add(c);
  for (const target of targetChars) {
    if (covered.has(target)) continue;
    const example = usable.find((w) => w.word.includes(target)); // usable is freq-sorted → lowest freqRank first
    if (example) {
      allowedWords.push(example);
      for (const c of example.word) covered.add(c);
    }
  }

  return { allowedChars, targetChars, allowedWords };
}
