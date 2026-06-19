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
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResult {
  text: string;
  model: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  generate(opts: LlmGenerateOptions): Promise<LlmResult>;
}
