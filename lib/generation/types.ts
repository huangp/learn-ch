import { z } from 'zod';
import type { LlmUsage } from '../llm/provider';
import type { Persona } from '../persona/presets';
import type { Genre } from '../genres/presets';
import type { StorySeed } from '../seeds/types';

// The §8.5 output contract the LLM must emit: hanzi-only prose + questions + choices,
// NO pinyin (pinyin/gloss are added deterministically in Phase 4). Zod both validates
// structure and yields precise messages we feed back into the repair loop on malformed output.

export const ComprehensionQuestionSchema = z.object({
  q: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  answer: z.number().int().min(0),
  testsChars: z.array(z.string()).default([]),
});

export const ChoiceSchema = z.object({
  label: z.string().min(1),
  seed: z.string().min(1),
});

// §8.5 soft-gloss: the model's explicit, SEPARATE declaration of the out-of-vocab words it
// deliberately used for coherence. Kept distinct from the known/allowed vocabulary — these only
// join the allowed set internally (to pass validateChars) and are surfaced with pinyin + gloss.
// Pinyin is NEVER taken from the model; it's filled deterministically downstream (annotate).
export const GlossaryEntrySchema = z.object({
  word: z.string().min(1),
  gloss: z.string().min(1),
});

export const StoryJsonSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    targetCharsUsed: z.array(z.string()).default([]),
    comprehensionQuestions: z.array(ComprehensionQuestionSchema).default([]),
    choices: z.array(ChoiceSchema).default([]),
    glossary: z.array(GlossaryEntrySchema).default([]),
  })
  // answer must index into its own options.
  .refine(
    (s) => s.comprehensionQuestions.every((q) => q.answer < q.options.length),
    { message: 'a comprehensionQuestions[].answer is out of range for its options' },
  );

export type ComprehensionQuestion = z.infer<typeof ComprehensionQuestionSchema>;
export type Choice = z.infer<typeof ChoiceSchema>;
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
export type StoryJson = z.infer<typeof StoryJsonSchema>;

/** A story-length range in characters (§15 #4) — the model is asked to land between min and max. */
export interface LengthBand {
  min: number;
  max: number;
}

/** Inputs to a single story generation. Targets/due are explicit charIds (Phase 6 selectors deferred). */
export interface GenerationConfig {
  targetCharIds: number[];
  dueCharIds?: number[];
  theme?: string;
  /** Target length range; derived per-learner via lib/story/length.ts, else DEFAULT_LENGTH_BAND. */
  lengthChars?: LengthBand;
  maxWords?: number;
  maxRepairs?: number;
  k?: number;
  /** Max out-of-vocab words the model may declare in `glossary` (default MAX_GLOSSED_WORDS). */
  maxGlossed?: number;
  /** Override the global known-coverage hard gate (default KNOWN_COVERAGE_FLOOR). */
  coverageBand?: number;
  /** Override the per-sentence coverage floor (default MIN_SENTENCE_COVERAGE = 0.85). */
  minSentenceCoverage?: number;
  /** Bootstrap mode (§16.4): relax the global coverage gate (validateChars still enforces the allowed set). */
  bootstrap?: boolean;
  /** Prior story body, for branching continuations (§8 priorStory). */
  priorStory?: string;
  /** Stable branch identity (choices[].seed) — a model-independent plot anchor for continuations. */
  seed?: string;
  /** Recurring companion (§11): woven into the prose + its name forced into the allowed set. */
  persona?: Persona;
  /** Story genre/tone steer (§17.1): a directive woven into the prompt; sets the THEME line. */
  genre?: Genre;
  /** Plot skeleton to retell (§17.2): beats woven into the prose + any allowNames forced into the allowed set. */
  storySeed?: StorySeed;
  model?: string;
  /** Per-attempt diagnostics hook (logging/debugging). Called once per LLM turn. */
  onAttempt?: (info: AttemptDiagnostics) => void;
}

export interface GenerationMeta {
  model: string;
  repairIterations: number;
  knownCoverage: number;
  targetCoverage: number; // fraction of targets meeting the ≥K bar
  perSentenceMin: number;
  fallbackUsed: boolean;
  usage: LlmUsage;
  costUsd: number;
  latencyMs: number;
  /** Branch seed this story continued (choices[].seed), when generated from a branch. */
  branchSeed?: string;
  /** Companion persona this story featured (§11), when one was active. */
  personaId?: string;
  /** Genre this story was steered toward (§17.1), when one was active — resolves back via getGenre. */
  genreId?: string;
  /** Story seed this story retold (§17.2), when generated from one — resolves back via getStorySeed. */
  seedId?: string;
  /** Count of out-of-vocab words declared in the story's glossary (§8.5 soft-gloss). */
  glossedCount?: number;
  /** True when the story was returned despite not passing all gates (best-effort draft). */
  belowTarget?: boolean;
  /** Human-readable shortfalls when belowTarget (reuses describeFailures output). */
  shortfalls?: string[];
  /** Cross-learner reuse (lib/story/reuse.ts): the source story this one was cloned from. */
  reusedFromStoryId?: number;
  /** Reuse attribution: the source learner (same parent account) whose story was reused. */
  reusedFromLearnerId?: number;
  /** Reuse attribution: the source learner's display name ("this story comes from learner X"). */
  reusedFromLearnerName?: string;
}

export interface GenerationResult {
  story: StoryJson;
  meta: GenerationMeta;
}

/** Diagnostics for one LLM turn — what was wrong (or that it passed). */
export interface AttemptDiagnostics {
  phase: 'initial' | 'repair' | 'fallback';
  attempt: number; // 0-based LLM-call index
  passed: boolean;
  /** Human-readable failure reasons (empty when passed). */
  reasons: string[];
  parseError?: string;
  /** Provider stop reason (e.g. 'max_tokens'/'length' = truncated → likely the cause of bad JSON). */
  stopReason?: string;
  knownCoverage?: number;
  targetCoverage?: number;
  perSentenceMin?: number;
  body?: string;
}

/** Thrown when no attempt (including fallbacks) produces a passing story. */
export class GenerationFailed extends Error {
  constructor(
    message: string,
    readonly meta: GenerationMeta,
    /** Why the best attempt still failed (out-of-vocab chars, low sentence, missing due, …). */
    readonly reasons: string[] = [],
  ) {
    super(message);
    this.name = 'GenerationFailed';
  }
}
