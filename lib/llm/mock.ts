import type { LlmGenerateOptions, LlmProvider, LlmResult } from './provider.js';

type Responder = string | ((opts: LlmGenerateOptions, call: number) => string);

/**
 * Deterministic LLM stand-in for unit tests. Constructed with either a scripted
 * list of responses (one per call, in order) or a function of the call. Lets the
 * generate → validate → repair loop be tested with no network or API key.
 */
export class MockLlmProvider implements LlmProvider {
  private responders: Responder[];
  private call = 0;
  readonly model: string;
  /** Captured generate() options, for assertions on what the loop sent. */
  readonly calls: LlmGenerateOptions[] = [];

  constructor(responders: Responder[] | Responder, model = 'mock') {
    this.responders = Array.isArray(responders) ? responders : [responders];
    this.model = model;
  }

  async generate(opts: LlmGenerateOptions): Promise<LlmResult> {
    this.calls.push(opts);
    const i = this.call++;
    const responder =
      this.responders[Math.min(i, this.responders.length - 1)] ?? '';
    const text = typeof responder === 'function' ? responder(opts, i) : responder;
    return {
      text,
      model: opts.model ?? this.model,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
