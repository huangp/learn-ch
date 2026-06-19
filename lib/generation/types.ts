import { z } from 'zod';
import type { LlmUsage } from '../llm/provider.js';

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

export const StoryJsonSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    targetCharsUsed: z.array(z.string()).default([]),
    comprehensionQuestions: z.array(ComprehensionQuestionSchema).default([]),
    choices: z.array(ChoiceSchema).default([]),
  })
  // answer must index into its own options.
  .refine(
    (s) => s.comprehensionQuestions.every((q) => q.answer < q.options.length),
    { message: 'a comprehensionQuestions[].answer is out of range for its options' },
  );

export type ComprehensionQuestion = z.infer<typeof ComprehensionQuestionSchema>;
export type Choice = z.infer<typeof ChoiceSchema>;
export type StoryJson = z.infer<typeof StoryJsonSchema>;

/** Inputs to a single story generation. Targets/due are explicit charIds (Phase 6 selectors deferred). */
export interface GenerationConfig {
  targetCharIds: number[];
  dueCharIds?: number[];
  theme?: string;
  lengthChars?: number;
  maxWords?: number;
  maxRepairs?: number;
  k?: number;
  /** Bootstrap mode (§16.4): relax the global coverage gate (validateChars still enforces the allowed set). */
  bootstrap?: boolean;
  /** Prior story body, for branching continuations (§8 priorStory). */
  priorStory?: string;
  model?: string;
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
}

export interface GenerationResult {
  story: StoryJson;
  meta: GenerationMeta;
}

/** Thrown when no attempt (including fallbacks) produces a passing story. */
export class GenerationFailed extends Error {
  constructor(
    message: string,
    readonly meta: GenerationMeta,
  ) {
    super(message);
    this.name = 'GenerationFailed';
  }
}
