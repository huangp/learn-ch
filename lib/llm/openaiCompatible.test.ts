import { describe, expect, test } from 'vitest';
import { OpenAiCompatibleProvider, type OpenAiLike } from './openaiCompatible';

// A fake openai-shaped client: captures the request body and returns a canned completion.
function fakeClient(usage?: Record<string, unknown>): { client: OpenAiLike; calls: any[] } {
  const calls: any[] = [];
  const client: OpenAiLike = {
    chat: {
      completions: {
        async create(body) {
          calls.push(body);
          return {
            model: body.model,
            choices: [{ message: { content: '{"title":"x","body":"你好"}', role: 'assistant' } }],
            usage: { prompt_tokens: 100, completion_tokens: 20, ...usage },
          } as any;
        },
      },
    },
  };
  return { client, calls };
}

describe('OpenAiCompatibleProvider', () => {
  test('sends model, system+user messages and max_tokens', async () => {
    const { client, calls } = fakeClient();
    const p = new OpenAiCompatibleProvider({ client, model: 'openai/gpt-4o-mini' });
    await p.generate({ system: 'SYS', messages: [{ role: 'user', content: 'U1' }], maxTokens: 512 });

    const body = calls[0];
    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(body.max_tokens).toBe(512);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'U1' });
  });

  test('cache:true on an anthropic/* model adds cache_control to system + first user msg only', async () => {
    const { client, calls } = fakeClient();
    const p = new OpenAiCompatibleProvider({ client, model: 'anthropic/claude-haiku-4.5' });
    await p.generate({
      system: 'SYS',
      messages: [
        { role: 'user', content: 'U1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'U2' },
      ],
      cache: true,
    });

    const [sys, u1, a1, u2] = calls[0].messages;
    expect(sys.content).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
    expect(u1.content).toEqual([{ type: 'text', text: 'U1', cache_control: { type: 'ephemeral' } }]);
    // Only the FIRST user message is a breakpoint; later turns stay plain strings.
    expect(a1.content).toBe('A1');
    expect(u2.content).toBe('U2');
  });

  test('cache:true on a non-explicit-cache model leaves content as plain strings', async () => {
    const { client, calls } = fakeClient();
    const p = new OpenAiCompatibleProvider({ client, model: 'openai/gpt-4o-mini' });
    await p.generate({ system: 'SYS', messages: [{ role: 'user', content: 'U1' }], cache: true });

    expect(calls[0].messages[0].content).toBe('SYS');
    expect(calls[0].messages[1].content).toBe('U1');
  });

  test('maps response text and usage (incl. cached tokens)', async () => {
    const { client } = fakeClient({ prompt_tokens_details: { cached_tokens: 80 } });
    const p = new OpenAiCompatibleProvider({ client, model: 'anthropic/claude-haiku-4.5' });
    const res = await p.generate({ system: 'SYS', messages: [{ role: 'user', content: 'U1' }] });

    expect(res.text).toBe('{"title":"x","body":"你好"}');
    expect(res.model).toBe('anthropic/claude-haiku-4.5');
    expect(res.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 80 });
  });

  test('requests usage accounting from OpenRouter', async () => {
    const { client, calls } = fakeClient();
    const p = new OpenAiCompatibleProvider({ client });
    await p.generate({ system: 'SYS', messages: [{ role: 'user', content: 'U1' }] });
    expect(calls[0].usage).toEqual({ include: true });
  });

  test('a non-OpenRouter base URL (e.g. Moonshot) omits the OpenRouter usage extension', async () => {
    const { client, calls } = fakeClient({ prompt_tokens_details: { cached_tokens: 0 } });
    const p = new OpenAiCompatibleProvider({ client, baseURL: 'https://api.moonshot.cn/v1', model: 'kimi-k2-0905-preview' });
    const res = await p.generate({ system: 'SYS', messages: [{ role: 'user', content: 'U1' }] });

    // No OpenRouter-only `usage:{include:true}` field on the request body...
    expect(calls[0].usage).toBeUndefined();
    // ...but standard text + token accounting still map.
    expect(res.text).toBe('{"title":"x","body":"你好"}');
    expect(res.model).toBe('kimi-k2-0905-preview');
    expect(res.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 0 });
  });

  test('reasoning:false on OpenRouter disables reasoning via reasoning:{enabled:false}', async () => {
    const { client, calls } = fakeClient();
    const p = new OpenAiCompatibleProvider({ client, model: 'some/reasoner' });
    await p.generate({ system: 'SYS', messages: [{ role: 'user', content: 'U1' }], reasoning: false });
    expect(calls[0].reasoning).toEqual({ enabled: false });
  });

  test('reasoning is not sent by default, nor on a non-OpenRouter base URL', async () => {
    const a = fakeClient();
    await new OpenAiCompatibleProvider({ client: a.client }).generate({ system: 'S', messages: [{ role: 'user', content: 'U' }] });
    expect(a.calls[0].reasoning).toBeUndefined();

    const b = fakeClient();
    await new OpenAiCompatibleProvider({ client: b.client, baseURL: 'https://api.moonshot.cn/v1' }).generate({
      system: 'S',
      messages: [{ role: 'user', content: 'U' }],
      reasoning: false,
    });
    expect(b.calls[0].reasoning).toBeUndefined();
  });

  describe('cacheMode (LLM_CACHE) with presets', () => {
    const cacheReq = { system: 'SYS', messages: [{ role: 'user' as const, content: 'U1' }], cache: true };
    const isCached = (msg: any) => Array.isArray(msg.content) && msg.content[0]?.cache_control != null;

    test("cacheMode 'on' forces cache_control even on a bare @preset/slug model", async () => {
      const { client, calls } = fakeClient();
      const p = new OpenAiCompatibleProvider({ client, model: '@preset/my-slug', cacheMode: 'on' });
      await p.generate(cacheReq);
      expect(isCached(calls[0].messages[0])).toBe(true); // system
      expect(isCached(calls[0].messages[1])).toBe(true); // first user msg
    });

    test("cacheMode 'off' disables cache_control on an anthropic/* model", async () => {
      const { client, calls } = fakeClient();
      const p = new OpenAiCompatibleProvider({ client, model: 'anthropic/claude-haiku-4.5', cacheMode: 'off' });
      await p.generate(cacheReq);
      expect(calls[0].messages[0].content).toBe('SYS');
      expect(calls[0].messages[1].content).toBe('U1');
    });

    test("cacheMode 'auto' (default): anthropic/* caches, @preset/slug does not", async () => {
      const anth = fakeClient();
      await new OpenAiCompatibleProvider({ client: anth.client, model: 'anthropic/claude-haiku-4.5' }).generate(cacheReq);
      expect(isCached(anth.calls[0].messages[0])).toBe(true);

      const preset = fakeClient();
      await new OpenAiCompatibleProvider({ client: preset.client, model: '@preset/my-slug' }).generate(cacheReq);
      expect(preset.calls[0].messages[0].content).toBe('SYS');
    });

    test('unknown LLM_CACHE value falls back to auto', async () => {
      const prev = process.env.LLM_CACHE;
      process.env.LLM_CACHE = 'bogus';
      try {
        const { client, calls } = fakeClient();
        // auto + bare preset → no caching
        await new OpenAiCompatibleProvider({ client, model: '@preset/my-slug' }).generate(cacheReq);
        expect(calls[0].messages[0].content).toBe('SYS');
      } finally {
        if (prev === undefined) delete process.env.LLM_CACHE;
        else process.env.LLM_CACHE = prev;
      }
    });
  });
});
