import { AnthropicProvider } from './anthropic';
import type { LlmProvider } from './provider';

export type { LlmProvider, LlmMessage, LlmGenerateOptions, LlmResult, LlmUsage } from './provider';
export { AnthropicProvider, DEFAULT_MODEL } from './anthropic';
export { MockLlmProvider } from './mock';
export { costUsd } from './pricing';

export interface LlmConfig {
  provider?: string;
  apiKey?: string;
  model?: string;
}

/**
 * Build the configured provider. Defaults to Anthropic + claude-haiku-4-5;
 * `provider` / `model` fall back to LLM_PROVIDER / LLM_MODEL env vars (§4).
 */
export function createLlmProvider(cfg: LlmConfig = {}): LlmProvider {
  const provider = cfg.provider ?? process.env.LLM_PROVIDER ?? 'anthropic';
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey: cfg.apiKey, model: cfg.model });
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
