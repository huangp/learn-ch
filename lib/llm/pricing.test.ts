import { describe, expect, test } from 'vitest';
import { costUsd } from './pricing';

// claude-haiku-4-5: $1/1M in, $5/1M out.
describe('costUsd', () => {
  test('plain input + output', () => {
    expect(costUsd('claude-haiku-4-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(6, 6);
  });

  test('cache reads bill at 0.1x input, writes at 1.25x input', () => {
    // 1M cache reads = $0.10, 1M cache writes = $1.25, no plain input/output.
    const c = costUsd('claude-haiku-4-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });
    expect(c).toBeCloseTo(0.1 + 1.25, 6);
  });

  test('dated model id matched by prefix', () => {
    expect(costUsd('claude-haiku-4-5-20251001', { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(1, 6);
  });

  test('unknown model (e.g. OpenRouter slug) costs 0', () => {
    expect(costUsd('anthropic/claude-haiku-4.5', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(0);
  });
});
