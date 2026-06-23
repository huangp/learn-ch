import type { LlmUsage } from './provider';

// USD per 1M tokens, by model. Used only for the eval cost metric (§12) — not on
// the hot path. Update when prices change; unknown models fall back to 0 cost.
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-haiku-4-5': { inputPer1M: 1, outputPer1M: 5 },
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'claude-opus-4-8': { inputPer1M: 15, outputPer1M: 75 },
};

// Prompt-cache multipliers on the input rate (Anthropic's published pricing): cached reads are
// billed at 0.1×, cache writes (5-min TTL) at 1.25×. `inputTokens` already excludes cached reads.
const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_MULT = 1.25;

/**
 * Estimated USD cost of a generation, by model + token usage. The API returns a dated
 * model id (e.g. `claude-haiku-4-5-20251001`), so match the longest pricing key that is
 * a prefix of it. 0 for unknown models. (OpenRouter slugs like `anthropic/claude-haiku-4.5`
 * won't prefix-match these keys and fall back to 0; OpenRouter also returns a real `cost`
 * field that could be surfaced later instead of this table.)
 */
export function costUsd(model: string, usage: LlmUsage): number {
  const key = Object.keys(PRICING)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return 0;
  const p = PRICING[key];
  const inputUnits =
    usage.inputTokens +
    (usage.cacheReadTokens ?? 0) * CACHE_READ_MULT +
    (usage.cacheWriteTokens ?? 0) * CACHE_WRITE_MULT;
  return (inputUnits * p.inputPer1M + usage.outputTokens * p.outputPer1M) / 1_000_000;
}
