// Phase 3 generation constants (§8). All PROVISIONAL — tune empirically via the
// eval harness (§12, §15 open decisions #3/#4/#6). Same convention as the
// provisional constants in lib/learner/seed.ts and DEFAULT_MAX_WORDS in lib/allowlist.

/** Min in-story occurrences of each target char → varied re-encounter (§8.3, K). */
export const K = 2;

/** Default story length in characters (band ~60–120; grows with the learner, §15 #4). */
export const DEFAULT_LENGTH_CHARS = 100;

/** Max targeted-repair iterations before falling back (§8.1). */
export const MAX_REPAIRS = 4;

/** Global known-coverage band (§8.3): aim for TARGET, never accept below FLOOR. */
export const KNOWN_COVERAGE_TARGET = 0.95;
export const KNOWN_COVERAGE_FLOOR = 0.9;

/** Per-sentence local floor — kills the "one unparseable sentence" failure a global avg hides (§8.3). */
export const MIN_SENTENCE_COVERAGE = 0.85;
