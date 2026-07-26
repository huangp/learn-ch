import { inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters } from '../../db/schema';
import { getKnownChars } from '../allowlist/index';
import { selectNewChars } from '../grading/select';

// Parent document upload — per-child target picking. An uploaded verbatim text isn't engineered
// around a learner, so we let the document decide what it teaches (like cross-learner reuse in
// lib/story/reuse.ts): from the doc's UNKNOWN chars, prefer the learner's curriculum
// frontier-ready ones (component prereqs met), then fall back to the most-frequent remaining
// unknowns so every document teaches at least a little. Capped so SRS isn't flooded.

/** Max distinct new chars an uploaded document introduces at once (tunable). */
export const MAX_UPLOAD_TARGETS = 8;

/** Resolve charIds → strings, preserving input order (mirror of the private helper in reuse.ts). */
function resolveChars(db: Db, ids: number[]): string[] {
  if (ids.length === 0) return [];
  const rows = db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.id, ids)).all();
  const map = new Map(rows.map((r) => [r.id, r.char]));
  return ids.map((id) => map.get(id)).filter((c): c is string => c != null);
}

/**
 * Pick the target chars an uploaded document teaches `learnerId`: frontier-ready unknowns first
 * (curriculum/freq order), topped up with the most-frequent remaining unknowns, capped at `max`.
 * Chars absent from the master `characters` table (Traditional / off-curriculum) can't be targets.
 */
export function pickTargetsFromDoc(db: Db, learnerId: number, docHanChars: string[], max = MAX_UPLOAD_TARGETS): string[] {
  const known = getKnownChars(db, learnerId);
  const unknown = docHanChars.filter((c) => !known.has(c));
  if (unknown.length === 0 || max <= 0) return [];
  const unknownSet = new Set(unknown);

  // 1. Frontier-ready unknowns, in curriculum order (freq-tie-broken). selectNewChars with a huge
  //    n walks the whole curriculum, so intersecting with the doc keeps that ranking for free.
  const frontier = resolveChars(db, selectNewChars(db, learnerId, Number.MAX_SAFE_INTEGER));
  const targets: string[] = [];
  const chosen = new Set<string>();
  for (const c of frontier) {
    if (!unknownSet.has(c)) continue;
    targets.push(c);
    chosen.add(c);
    if (targets.length >= max) return targets;
  }

  // 2. Fallback: fill from the remaining unknowns by freqRank (asc, nulls last). Off-curriculum
  //    chars simply aren't returned by this query, so they never become targets.
  const remaining = unknown.filter((c) => !chosen.has(c));
  if (remaining.length > 0) {
    const rows = db.select({ char: characters.char, freqRank: characters.freqRank }).from(characters).where(inArray(characters.char, remaining)).all();
    rows.sort((a, b) => (a.freqRank ?? Infinity) - (b.freqRank ?? Infinity));
    for (const r of rows) {
      targets.push(r.char);
      if (targets.length >= max) break;
    }
  }

  return targets;
}
