import type { LlmUsage } from './provider.js';

// USD per 1M tokens, by model. Used only for the eval cost metric (§12) — not on
// the hot path. Update when prices change; unknown models fall back to 0 cost.
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-haiku-4-5': { inputPer1M: 1, outputPer1M: 5 },
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'claude-opus-4-8': { inputPer1M: 15, outputPer1M: 75 },
};

/**
 * Estimated USD cost of a generation, by model + token usage. The API returns a dated
 * model id (e.g. `claude-haiku-4-5-20251001`), so match the longest pricing key that is
 * a prefix of it. 0 for unknown models.
 */
export function costUsd(model: string, usage: LlmUsage): number {
  const key = Object.keys(PRICING)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return 0;
  const p = PRICING[key];
  return (usage.inputTokens * p.inputPer1M + usage.outputTokens * p.outputPer1M) / 1_000_000;
}
