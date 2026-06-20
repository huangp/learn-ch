import Anthropic from '@anthropic-ai/sdk';
import type { LlmGenerateOptions, LlmProvider, LlmResult } from './provider';

export const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_MAX_TOKENS = 2048;

/** Anthropic Messages API implementation of LlmProvider. */
export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set (required for the real LLM provider).');
    }
    this.client = new Anthropic({ apiKey });
    this.defaultModel = opts.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;
  }

  async generate(opts: LlmGenerateOptions): Promise<LlmResult> {
    const model = opts.model ?? this.defaultModel;
    const res = await this.client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      text,
      model: res.model,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  }
}
