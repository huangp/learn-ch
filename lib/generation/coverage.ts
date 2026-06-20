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

  const bodyHan = hanChars(hanzi);
  const knownCoverage = knownFraction(bodyHan, opts.known);

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
    const cov = knownFraction(sChars, opts.known);
    if (cov < perSentenceMin) perSentenceMin = cov;
    if (cov < minSentence) lowCoverageSentences.push({ text: sentence, coverage: cov });
    const present = new Set(sChars);
    for (const t of opts.targets) if (present.has(t)) targetSentenceCount.set(t, targetSentenceCount.get(t)! + 1);
  }

  // A target met ≥2× but confined to a single sentence isn't "varied re-encounter".
  const clusteredTargets = opts.targets.filter(
    (t) => targetCounts[t] >= 2 && targetSentenceCount.get(t)! <= 1,
  );

  // Bootstrap (§16.4) relaxes the coverage gates entirely (global %, per-sentence floor,
  // clustering) — with a tiny vocab they're mathematically impossible; validateChars still
  // enforces "every non-target char is allowed". Only target/due presence is required.
  const coverageOk =
    opts.bootstrap ||
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
  };
}
