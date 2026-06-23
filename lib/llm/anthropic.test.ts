import { describe, expect, test } from 'vitest';
import { AnthropicProvider, type AnthropicLike } from './anthropic';

function fakeClient(usage?: Record<string, unknown>): { client: AnthropicLike; calls: any[] } {
  const calls: any[] = [];
  const client: AnthropicLike = {
    messages: {
      async create(body) {
        calls.push(body);
        return {
          model: body.model,
          content: [{ type: 'text', text: '{"title":"x","body":"你好"}' }],
          usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: null, cache_creation_input_tokens: null, ...usage },
        } as any;
      },
    },
  };
  return { client, calls };
}

describe('AnthropicProvider', () => {
  test('no cache: system + messages are plain strings', async () => {
    const { client, calls } = fakeClient();
    const p = new AnthropicProvider({ client, model: 'claude-haiku-4-5' });
    await p.generate({ system: 'SYS', messages: [{ role: 'user', content: 'U1' }] });

    expect(calls[0].system).toBe('SYS');
    expect(calls[0].messages[0]).toEqual({ role: 'user', content: 'U1' });
  });

  test('cache:true marks system + first user msg with cache_control', async () => {
    const { client, calls } = fakeClient();
    const p = new AnthropicProvider({ client, model: 'claude-haiku-4-5' });
    await p.generate({
      system: 'SYS',
      messages: [
        { role: 'user', content: 'U1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'U2' },
      ],
      cache: true,
    });

    expect(calls[0].system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
    const [u1, a1, u2] = calls[0].messages;
    expect(u1.content).toEqual([{ type: 'text', text: 'U1', cache_control: { type: 'ephemeral' } }]);
    expect(a1.content).toBe('A1');
    expect(u2.content).toBe('U2');
  });

  test('maps cache usage fields', async () => {
    const { client } = fakeClient({ cache_read_input_tokens: 80, cache_creation_input_tokens: 100 });
    const p = new AnthropicProvider({ client });
    const res = await p.generate({ system: 'SYS', messages: [{ role: 'user', content: 'U1' }] });
    expect(res.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 80, cacheWriteTokens: 100 });
  });
});
