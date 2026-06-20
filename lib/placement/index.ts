import { inArray, lte, isNotNull, and, asc } from 'drizzle-orm';
import type { Db } from '../db';
import { characters } from '../../db/schema';
import { isHan } from '../../data/pipeline/lib';

// The four onboarding paths (§16.1). Each produces a set of known `charId`s that
// all converge on `seedLearner`. The UIs (Phase 5) are just different ways to
// build the same set; the resolvers below are the testable core.

export type PlacementMethod = 'hsk' | 'paste' | 'grid' | 'zero';

/** Path 1 — self-declare HSK level. Known = every char at or below `level`. */
export function selfDeclareHsk(db: Db, level: number | 'none'): number[] {
  if (level === 'none') return [];
  const rows = db
    .select({ id: characters.id })
    .from(characters)
    .where(and(isNotNull(characters.hskLevel), lte(characters.hskLevel, level)))
    .all();
  return rows.map((r) => r.id);
}

export interface PasteResult {
  knownCharIds: number[];
  foundCount: number; // == knownCharIds.length; drives the "Found N known characters" confirmation
}

/**
 * Path 2 — paste known characters. Extract CJK codepoints, dedupe, intersect with
 * the Simplified master; non-matching / Traditional / non-CJK input is dropped
 * silently (§16.1).
 */
export function fromPastedText(db: Db, text: string): PasteResult {
  const distinct = [...new Set([...text].filter(isHan))];
  if (distinct.length === 0) return { knownCharIds: [], foundCount: 0 };
  const rows = db
    .select({ id: characters.id })
    .from(characters)
    .where(inArray(characters.char, distinct))
    .all();
  const knownCharIds = rows.map((r) => r.id);
  return { knownCharIds, foundCount: knownCharIds.length };
}

export interface ToggleGridInput {
  cutoffFreqRank?: number; // bulk "I know everything down to here" (freqRank ≤ cutoff)
  known?: string[]; // fine per-char additions (the ragged edge above the cutoff)
  unknown?: string[]; // fine per-char removals (chars below the cutoff the learner doesn't know)
}

/**
 * Path 3 — frequency-ranked toggle grid. Bulk cutoff ∪ fine `known`, minus fine
 * `unknown`. Frequency order (not curriculum order) because learners self-recognize
 * by familiarity, not component logic (§16.1).
 */
export function fromToggleGrid(db: Db, input: ToggleGridInput): number[] {
  const { cutoffFreqRank, known = [], unknown = [] } = input;

  const bulk = cutoffFreqRank
    ? db
        .select({ id: characters.id })
        .from(characters)
        .where(and(isNotNull(characters.freqRank), lte(characters.freqRank, cutoffFreqRank)))
        .all()
        .map((r) => r.id)
    : [];

  const ids = new Set<number>(bulk);

  const resolve = (chars: string[]) =>
    chars.length === 0
      ? []
      : db.select({ id: characters.id }).from(characters).where(inArray(characters.char, chars)).all();

  for (const r of resolve(known)) ids.add(r.id);
  for (const r of resolve(unknown)) ids.delete(r.id);

  return [...ids];
}

/** Path 4 — start from zero. Empty known set → bootstrap mode (§16.4). */
export function fromZero(): number[] {
  return [];
}

export interface FreqRankedChar {
  char: string;
  freqRank: number;
  hskLevel: number | null;
}

/**
 * Frequency-ranked char list backing the toggle-grid UI (§16.1 path 3). Most frequent
 * first; chars without a freqRank are excluded (can't be placed in the grid). Capped to
 * keep the practical depth bounded (§16.1 "cap the practical depth").
 */
export function listFrequencyRankedChars(db: Db, limit = 1500): FreqRankedChar[] {
  return db
    .select({ char: characters.char, freqRank: characters.freqRank, hskLevel: characters.hskLevel })
    .from(characters)
    .where(isNotNull(characters.freqRank))
    .orderBy(asc(characters.freqRank))
    .limit(limit)
    .all()
    .map((r) => ({ char: r.char, freqRank: r.freqRank as number, hskLevel: r.hskLevel }));
}
