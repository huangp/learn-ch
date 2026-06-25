import { K as DEFAULT_K, KNOWN_COVERAGE_FLOOR, MIN_SENTENCE_COVERAGE } from './constants';

// §8.3 checkCoverage — pure, no LLM. Verifies the pedagogical contract: targets
// re-encountered ≥K times, due chars present, enough known context globally AND
// per-sentence (the local floor catches one unparseable sentence a global avg hides).

const HAN = /\p{Script=Han}/u;
const SENTENCE_SPLIT = /[。！？!?\n]+/;

export interface CoverageOptions {
  /** Chars the learner already knows (allowedChars minus targets); due chars are a subset. */
  known: Set<string>;
  targets: string[];
  due?: string[];
  k?: number;
  /** Global known-coverage hard gate (acceptable floor). */
  band?: number;
  minSentenceCoverage?: number;
  /** Bootstrap mode (§16.4): skip the global known-coverage gate. */
  bootstrap?: boolean;
  /** Relaxed mode (small vocab): replace the % floors with a cap on DISTINCT unknown chars. */
  maxUnknownChars?: number;
  /**
   * §8.5 soft-gloss: chars of out-of-vocab words the model declared in its glossary. Counted as
   * comprehensible (covered) here — they lift known-coverage and the per-sentence floor and don't
   * consume the relaxed unknown-char budget, so one rare-but-glossed word can't make a story fail.
   */
  glossedChars?: Set<string>;
}

export interface CoverageResult {
  ok: boolean;
  knownCoverage: number;
  targetCoverage: number; // fraction of targets meeting the ≥K bar
  perSentenceMin: number;
  targetCounts: Record<string, number>;
  targetsMissing: string[]; // appear < K times
  dueMissing: string[]; // appear 0 times
  lowCoverageSentences: { text: string; coverage: number }[];
  clusteredTargets: string[]; // appear ≥2× but all in one sentence
  unknownChars: string[]; // distinct Han chars not in `known` (targets + out-of-vocab)
}

function hanChars(s: string): string[] {
  return [...s].filter((c) => HAN.test(c));
}

function knownFraction(chars: string[], known: Set<string>): number {
  if (chars.length === 0) return 1;
  let k = 0;
  for (const c of chars) if (known.has(c)) k++;
  return k / chars.length;
}

export function checkCoverage(hanzi: string, opts: CoverageOptions): CoverageResult {
  const k = opts.k ?? DEFAULT_K;
  const band = opts.band ?? KNOWN_COVERAGE_FLOOR;
  const minSentence = opts.minSentenceCoverage ?? MIN_SENTENCE_COVERAGE;
  const due = opts.due ?? [];

  // Glossed (declared out-of-vocab) chars count as comprehensible, so fold them into the known set
  // for all coverage math: global/per-sentence fraction and the distinct-unknown computation.
  const known = opts.glossedChars?.size ? new Set([...opts.known, ...opts.glossedChars]) : opts.known;

  const bodyHan = hanChars(hanzi);
  const knownCoverage = knownFraction(bodyHan, known);

  // Distinct Han chars the learner doesn't know yet (targets ∉ known, plus any out-of-vocab).
  const unknownChars = [...new Set(bodyHan.filter((c) => !known.has(c)))];

  // Per-target occurrence counts over the whole body.
  const targetCounts: Record<string, number> = {};
  for (const t of opts.targets) targetCounts[t] = 0;
  for (const c of bodyHan) if (c in targetCounts) targetCounts[c]++;

  const targetsMissing = opts.targets.filter((t) => targetCounts[t] < k);
  const targetCoverage =
    opts.targets.length === 0
      ? 1
      : opts.targets.filter((t) => targetCounts[t] >= k).length / opts.targets.length;

  const dueCount = new Map<string, number>();
  for (const d of due) dueCount.set(d, 0);
  for (const c of bodyHan) if (dueCount.has(c)) dueCount.set(c, dueCount.get(c)! + 1);
  const dueMissing = due.filter((d) => (dueCount.get(d) ?? 0) === 0);

  // Per-sentence local floor + target clustering.
  const sentences = hanzi
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => hanChars(s).length > 0);

  let perSentenceMin = 1;
  const lowCoverageSentences: { text: string; coverage: number }[] = [];
  const targetSentenceCount = new Map<string, number>();
  for (const t of opts.targets) targetSentenceCount.set(t, 0);

  for (const sentence of sentences) {
    const sChars = hanChars(sentence);
    const cov = knownFraction(sChars, known);
    if (cov < perSentenceMin) perSentenceMin = cov;
    if (cov < minSentence) lowCoverageSentences.push({ text: sentence, coverage: cov });
    const present = new Set(sChars);
    for (const t of opts.targets) if (present.has(t)) targetSentenceCount.set(t, targetSentenceCount.get(t)! + 1);
  }

  // A target met ≥2× but confined to a single sentence isn't "varied re-encounter".
  const clusteredTargets = opts.targets.filter(
    (t) => targetCounts[t] >= 2 && targetSentenceCount.get(t)! <= 1,
  );

  // Coverage gate, in precedence order:
  // - Relaxed mode (small vocab): the % floors are mathematically hostile, so replace them with
  //   a cap on DISTINCT unknown chars (validateChars runs relaxed in tandem, so out-of-vocab
  //   chars are permitted but still consume this budget). Per-sentence/clustering gates are off.
  // - Bootstrap (§16.4): relax the coverage gates entirely; only target/due presence required.
  // - Otherwise: the strict global % + per-sentence floor + no-clustering gate.
  const coverageOk =
    opts.maxUnknownChars != null
      ? unknownChars.length <= opts.maxUnknownChars
      : opts.bootstrap ||
        (knownCoverage >= band && lowCoverageSentences.length === 0 && clusteredTargets.length === 0);

  const ok = targetsMissing.length === 0 && dueMissing.length === 0 && coverageOk;

  return {
    ok,
    knownCoverage,
    targetCoverage,
    perSentenceMin,
    targetCounts,
    targetsMissing,
    dueMissing,
    lowCoverageSentences,
    clusteredTargets,
    unknownChars,
  };
}
