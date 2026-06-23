import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { LlmGenerateOptions, LlmProvider, LlmResult } from './provider';

export const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
const DEFAULT_MAX_TOKENS = 2048;
const BASE_URL = 'https://openrouter.ai/api/v1';

// Per-request timeout. The generate→repair loop fires up to ~6 calls serially, so a single
// stalled upstream must fail fast instead of riding the SDK's 10-minute default (× retries) and
// leaving the story action pending for many minutes. Override with LLM_TIMEOUT_MS.
const DEFAULT_TIMEOUT_MS = 120_000;
export function llmTimeoutMs(): number {
  const n = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

// Models that need EXPLICIT cache_control breakpoints for prompt caching (Anthropic + Gemini).
// OpenAI-family models cache automatically with no markup, so we add nothing for them.
const EXPLICIT_CACHE_MODEL = /^(anthropic|google)\//;

// Whether to inject cache_control breakpoints. `auto` infers from the model id (above); `on`
// forces it (e.g. a bare `@preset/slug` whose preset routes to an Anthropic/Gemini model, which
// we can't detect from the slug); `off` disables. From the LLM_CACHE env var.
export type CacheMode = 'auto' | 'on' | 'off';
function parseCacheMode(v: string | undefined): CacheMode {
  return v === 'on' || v === 'off' || v === 'auto' ? v : 'auto';
}

/** Minimal shape of the openai client we use — lets tests inject a fake (no network). */
export interface OpenAiLike {
  chat: { completions: { create(body: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion> } };
}

/**
 * OpenRouter implementation of LlmProvider. OpenRouter is OpenAI-chat-completions
 * compatible, so we drive it with the openai SDK pointed at OpenRouter's baseURL.
 * Prompt caching for Anthropic/Gemini models needs explicit `cache_control` breakpoints,
 * which OpenRouter passes through to the upstream model (§4).
 */
export class OpenRouterProvider implements LlmProvider {
  private client: OpenAiLike;
  private defaultModel: string;
  private cacheMode: CacheMode;

  constructor(opts: { apiKey?: string; model?: string; client?: OpenAiLike; cacheMode?: CacheMode } = {}) {
    this.defaultModel = opts.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;
    this.cacheMode = opts.cacheMode ?? parseCacheMode(process.env.LLM_CACHE);
    if (opts.client) {
      this.client = opts.client;
      return;
    }
    const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set (required for the OpenRouter provider).');
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: BASE_URL,
      timeout: llmTimeoutMs(),
      maxRetries: 1,
      defaultHeaders: { 'HTTP-Referer': 'https://github.com/hanzi-graded-reader', 'X-Title': 'Hanzi Graded Reader' },
    });
  }

  async generate(opts: LlmGenerateOptions): Promise<LlmResult> {
    const model = opts.model ?? this.defaultModel;
    const cache =
      opts.cache === true &&
      (this.cacheMode === 'on' || (this.cacheMode === 'auto' && EXPLICIT_CACHE_MODEL.test(model)));

    // Stable prefix = system prompt + first user message. With `cache`, mark each as a single
    // text part carrying an ephemeral cache_control breakpoint so repair turns reuse it.
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: cache ? cacheableText(opts.system) : opts.system },
    ];
    let userSeen = false;
    for (const m of opts.messages) {
      const markFirstUser = cache && m.role === 'user' && !userSeen;
      if (m.role === 'user') userSeen = true;
      const content = markFirstUser ? cacheableText(m.content) : m.content;
      if (m.role === 'user') messages.push({ role: 'user', content });
      else messages.push({ role: 'assistant', content });
    }

    const body = {
      model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature,
      messages,
      // OpenRouter extension: return token accounting (incl. cached tokens) in the usage object.
      usage: { include: true },
    } as ChatCompletionCreateParamsNonStreaming;

    const res = await this.client.chat.completions.create(body);

    const text = res.choices[0]?.message?.content ?? '';
    const u = res.usage;
    return {
      text,
      model: res.model ?? model,
      usage: {
        inputTokens: u?.prompt_tokens ?? 0,
        outputTokens: u?.completion_tokens ?? 0,
        cacheReadTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
      },
    };
  }
}

/**
 * A one-element text content array carrying an ephemeral cache_control breakpoint. `cache_control`
 * is an OpenRouter/Anthropic passthrough field not in the OpenAI SDK types, so the return is `any` —
 * the single, deliberate boundary where the typed SDK doesn't model the extension.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cacheableText(text: string): any {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}
