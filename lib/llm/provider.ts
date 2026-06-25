// Phase 3 — LLM provider abstraction (§4). Generation is the only model-dependent
// piece; keep it behind a narrow interface so the engine is provider-agnostic and
// unit-testable with a mock (no network, no API key).

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmGenerateOptions {
  system: string;
  messages: LlmMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Cache the stable prefix — the system prompt and the first user message — so a multi-turn
   * thread (the generate → repair loop) reuses it instead of re-billing it every turn.
   * Off by default: caching a one-shot prompt is a net loss (cache write, no read).
   */
  cache?: boolean;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens served from a prompt cache (billed at a discount). */
  cacheReadTokens?: number;
  /** Tokens written to a prompt cache (Anthropic surcharges these). */
  cacheWriteTokens?: number;
}

export interface LlmResult {
  text: string;
  model: string;
  usage: LlmUsage;
  /**
   * Why the model stopped. A truncated response (Anthropic `max_tokens`, OpenAI/OpenRouter
   * `length`) yields incomplete — often unparseable — JSON, so the generation loop logs this
   * to distinguish "hit the output cap" from "the model returned genuinely bad JSON".
   */
  stopReason?: string;
}

export interface LlmProvider {
  generate(opts: LlmGenerateOptions): Promise<LlmResult>;
}
