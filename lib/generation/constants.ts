import type { LengthBand } from './types';

// Phase 3 generation constants (§8). All PROVISIONAL — tune empirically via the
// eval harness (§12, §15 open decisions #3/#4/#6). Same convention as the
// provisional constants in lib/learner/seed.ts and DEFAULT_MAX_WORDS in lib/allowlist.

/** Min in-story occurrences of each target char → varied re-encounter (§8.3, K). */
export const K = 3;

/**
 * Fallback length band when there's no learner context to derive from (§15 #4).
 * The per-learner curve — length that "grows with the learner" — lives in lib/story/length.ts
 * (`deriveLengthBand`), sourced from docs/story_length.md. This is the ~150-known / HSK1 row.
 */
export const DEFAULT_LENGTH_BAND: LengthBand = { min: 100, max: 200 };

/** Max targeted-repair iterations before falling back (§8.1). */
export const MAX_REPAIRS = 4;

/** Global known-coverage band (§8.3): aim for TARGET, never accept below FLOOR. */
export const KNOWN_COVERAGE_TARGET = 0.95;
export const KNOWN_COVERAGE_FLOOR = 0.9;

/** Per-sentence local floor — kills the "one unparseable sentence" failure a global avg hides (§8.3). */
export const MIN_SENTENCE_COVERAGE = 0.75;

/** Below this known-char count, swap the % coverage floors for an absolute unknown-char budget. */
export const RELAX_KNOWN_THRESHOLD = 500;

/** In relaxed mode, max DISTINCT unknown Han chars allowed in the body (targets + out-of-vocab). */
export const MAX_UNKNOWN_CHARS = 15;

/**
 * §8.5 soft-gloss: max out-of-vocab words the model may deliberately use (each declared in the
 * `glossary` field, shown to the reader with pinyin + gloss). Available to ALL learners — lets the
 * engine reach for the right word for coherence instead of dead-ending on the hard vocab gate.
 * Their chars count as comprehensible (covered) in checkCoverage, so a single rare word no longer
 * fails the per-sentence floor. Complementary to the small-vocab relaxed char budget above.
 */
export const MAX_GLOSSED_WORDS = 10;
