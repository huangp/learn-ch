import Anthropic from '@anthropic-ai/sdk';
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import type { LlmGenerateOptions, LlmProvider, LlmResult } from './provider';

export const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_MAX_TOKENS = 2048;

const EPHEMERAL = { type: 'ephemeral' as const };

/** Minimal shape of the Anthropic client we use — lets tests inject a fake (no network). */
export interface AnthropicLike {
  messages: { create(body: MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

/** Anthropic Messages API implementation of LlmProvider. */
export class AnthropicProvider implements LlmProvider {
  private client: AnthropicLike;
  private defaultModel: string;

  constructor(opts: { apiKey?: string; model?: string; client?: AnthropicLike } = {}) {
    this.defaultModel = opts.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;
    if (opts.client) {
      this.client = opts.client;
      return;
    }
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set (required for the real LLM provider).');
    }
    this.client = new Anthropic({ apiKey });
  }

  async generate(opts: LlmGenerateOptions): Promise<LlmResult> {
    const model = opts.model ?? this.defaultModel;

    // With `cache`, put an ephemeral cache_control breakpoint at the end of the stable prefix —
    // the system prompt and the first user message — so repair turns reuse it (§4).
    const system: MessageCreateParamsNonStreaming['system'] = opts.cache
      ? [{ type: 'text', text: opts.system, cache_control: EPHEMERAL }]
      : opts.system;
    let userMarked = false;
    const messages: MessageCreateParamsNonStreaming['messages'] = opts.messages.map((m) => {
      if (opts.cache && m.role === 'user' && !userMarked) {
        userMarked = true;
        return { role: m.role, content: [{ type: 'text' as const, text: m.content, cache_control: EPHEMERAL }] };
      }
      return { role: m.role, content: m.content };
    });

    const res = await this.client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature,
      system,
      messages,
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      text,
      model: res.model,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
