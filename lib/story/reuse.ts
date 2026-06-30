import { inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters } from '../../db/schema';
import { getLearner } from '../learner/crud';
import { getKnownChars } from '../allowlist/index';
import { selectDueChars, selectNewChars } from '../grading/select';
import { getPersona } from '../persona/presets';
import { getStorySeed } from '../seeds/presets';
import { validateChars } from '../generation/validate';
import { checkCoverage } from '../generation/coverage';
import {
  K,
  KNOWN_COVERAGE_FLOOR,
  MAX_REUSE_NEW_CHARS,
  MAX_UNKNOWN_CHARS,
  MIN_SENTENCE_COVERAGE,
  RELAX_KNOWN_THRESHOLD,
} from '../generation/constants';
import { listReusableCandidates, type ReusableCandidate } from './persist';

// Cross-learner story reuse. Story generation is slow (~6 serial LLM calls + a heteronym pass), but
// a persisted story's content (hanzi body, annotated pinyin/gloss, questions, choices, glossary) is
// learner-agnostic. So a story generated for learner A can serve learner B — IF B can read it and it
// teaches B something useful. That "fits B?" test is exactly the two pure, no-LLM gates the generator
// runs every attempt: validateChars (readability) + checkCoverage (target re-encounter ≥K + spread).
//
// Story-driven match: rather than demand a story cover B's pre-selected targets (rare), we let the
// story decide which new chars B learns — accept any fully-readable story whose introduced new-chars
// are all valid frontier next-steps for B (prereqs met, not already known), capped at a few at once.
// Reuse is scoped to the SAME PARENT ACCOUNT (listReusableCandidates) — the privacy boundary.

const HAN = /\p{Script=Han}/u;

export interface FindReusableOptions {
  /** B's preferred new-target count (for ranking) — mirrors generateAndPersistStory. */
  targets: number;
  /** B's due-char count to try to reinforce. */
  due: number;
  bootstrap?: boolean;
}

export interface ReuseHit {
  source: ReusableCandidate;
  /** New chars the reused story teaches B (recorded as B's targetChars). */
  targetChars: string[];
  /** B's due chars the body reinforces. */
  dueCharsUsed: string[];
  knownCoverage: number;
  targetCoverage: number;
}

/** Resolve charIds → strings, preserving input order. */
function resolveChars(db: Db, ids: number[]): string[] {
  if (ids.length === 0) return [];
  const rows = db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.id, ids)).all();
  const map = new Map(rows.map((r) => [r.id, r.char]));
  return ids.map((id) => map.get(id)).filter((c): c is string => c != null);
}

/** Proper-noun chars the generator force-adds for a candidate (persona name + seed allowNames). */
function properNouns(cand: ReusableCandidate): Set<string> {
  const out = new Set<string>();
  const persona = getPersona(cand.meta?.personaId);
  if (persona) for (const ch of persona.name) out.add(ch);
  const seed = getStorySeed(cand.meta?.seedId);
  if (seed?.allowNames) for (const name of seed.allowNames) for (const ch of name) out.add(ch);
  return out;
}

/** Han chars of the candidate's declared soft-gloss words (§8.5) — comprehensible like known chars. */
function glossedChars(cand: ReusableCandidate): Set<string> {
  const out = new Set<string>();
  for (const g of cand.glossary) for (const ch of g.word) if (HAN.test(ch)) out.add(ch);
  return out;
}

/**
 * Find an existing story (from another learner on the same account) reusable for `learnerId`, or null.
 * Pure DB read, no LLM. On a hit the caller clones it via reuseStory — instant, no generation.
 */
export function findReusableStory(db: Db, learnerId: number, opts: FindReusableOptions): ReuseHit | null {
  const learner = getLearner(db, learnerId);
  // Account scope is the reuse boundary; null owner (legacy/dev) → no cross-learner reuse.
  if (!learner || learner.ownerId == null) return null;

  const candidates = listReusableCandidates(db, learnerId, learner.ownerId);
  if (candidates.length === 0) return null;

  const known = getKnownChars(db, learnerId);
  // Full ordered frontier-ready new-char list (huge n → selectNewChars walks the whole curriculum).
  const frontierChars = resolveChars(db, selectNewChars(db, learnerId, Number.MAX_SAFE_INTEGER));
  if (frontierChars.length === 0) return null; // nothing new to teach → nothing reusable
  const frontierSet = new Set(frontierChars);
  const preferred = new Set(frontierChars.slice(0, opts.targets)); // B's top targets — for ranking
  const dueSet = new Set(resolveChars(db, selectDueChars(db, learnerId, opts.due)));

  const relaxed = known.size < RELAX_KNOWN_THRESHOLD;
  const maxUnknown = relaxed ? MAX_UNKNOWN_CHARS : undefined;

  let best: ReuseHit | null = null;
  let bestScore = -1;
  for (const cand of candidates) {
    const hit = evaluateCandidate(cand, { known, frontierSet, dueSet, relaxed, maxUnknown, bootstrap: opts.bootstrap });
    if (!hit) continue;
    // Rank: most new-chars overlapping B's preferred targets, then newest — keeps reuse on-path.
    const score = hit.targetChars.filter((c) => preferred.has(c)).length;
    if (score > bestScore || (score === bestScore && best != null && cand.createdAt > best.source.createdAt)) {
      best = hit;
      bestScore = score;
    }
  }
  return best;
}

function evaluateCandidate(
  cand: ReusableCandidate,
  ctx: { known: Set<string>; frontierSet: Set<string>; dueSet: Set<string>; relaxed: boolean; maxUnknown?: number; bootstrap?: boolean },
): ReuseHit | null {
  const nouns = properNouns(cand);
  const glossed = glossedChars(cand);
  // Readability: every Han char must be known, a forced proper noun, glossed, or a new char we vet below.
  const allowedChars = new Set<string>([...ctx.known, ...nouns]);
  const validation = validateChars(cand.hanzi, allowedChars, { relaxed: ctx.relaxed, glossedChars: glossed });
  if (validation.evasions.length > 0) return null; // latin/pinyin in the source → never reuse

  const newChars = [...new Set(validation.violations.map((v) => v.char))]; // chars S would teach B
  if (newChars.length < 1 || newChars.length > MAX_REUSE_NEW_CHARS) return null;
  if (!newChars.every((c) => ctx.frontierSet.has(c))) return null; // all must be valid frontier next-steps

  const bodyChars = new Set([...cand.hanzi].filter((c) => HAN.test(c)));
  const dueUsed = [...ctx.dueSet].filter((d) => bodyChars.has(d)); // only the due chars actually present

  const coverage = checkCoverage(cand.hanzi, {
    known: new Set<string>([...ctx.known, ...nouns]),
    targets: newChars,
    due: dueUsed,
    k: K,
    band: KNOWN_COVERAGE_FLOOR,
    minSentenceCoverage: MIN_SENTENCE_COVERAGE,
    bootstrap: ctx.bootstrap,
    maxUnknownChars: ctx.maxUnknown,
    glossedChars: glossed,
  });
  if (!coverage.ok) return null; // each new char must be genuinely taught (≥K, spread) + body readable

  return {
    source: cand,
    targetChars: newChars,
    dueCharsUsed: dueUsed,
    knownCoverage: coverage.knownCoverage,
    targetCoverage: coverage.targetCoverage,
  };
}
