import { describe, expect, test } from 'vitest';
import { MockLlmProvider } from './mock';
import {
  cleanSentence,
  extractImageBytes,
  generateExampleSentence,
  generateWordImage,
  imagePrompt,
  isValidSentence,
  type FetchLike,
} from './image';

// A 1x1 PNG, base64 — stands in for what an image model returns.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const DATA_URL = `data:image/png;base64,${PNG_B64}`;

const chatWithImage = () => ({ ok: true, async json() {
  return { choices: [{ message: { content: 'An English caption of the image', images: [{ image_url: { url: DATA_URL } }] } }] };
} } as unknown as Response);
const chatNoImage = () => ({ ok: true, async json() {
  return { choices: [{ message: { content: 'no image here' } }] };
} } as unknown as Response);

describe('imagePrompt', () => {
  test('describes a text-free mnemonic for the word', () => {
    const p = imagePrompt({ word: '我们', gloss: 'we' });
    expect(p).toContain('我们');
    expect(p).toContain('Do not put any text');
    expect(p).not.toContain('sentence'); // image-only now
  });
});

describe('extractImageBytes', () => {
  test('decodes message.images[0].image_url.url and ignores the caption text', () => {
    const buf = extractImageBytes({ content: 'caption', images: [{ image_url: { url: DATA_URL } }] });
    expect(buf.byteLength).toBe(Buffer.from(PNG_B64, 'base64').byteLength);
  });
  test('throws when no image present', () => {
    expect(() => extractImageBytes({ content: 'text only' })).toThrow();
  });
});

describe('generateWordImage', () => {
  function withKey<T>(fn: () => Promise<T>): Promise<T> {
    const prev = process.env.LLM_API_KEY;
    process.env.LLM_API_KEY = 'test-key';
    return fn().finally(() => {
      if (prev === undefined) delete process.env.LLM_API_KEY;
      else process.env.LLM_API_KEY = prev;
    });
  }

  test('returns image bytes from a chat response (ignoring the caption)', async () => {
    await withKey(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calls: any[] = [];
      const fakeFetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return chatWithImage();
      }) as unknown as FetchLike;

      const buf = await generateWordImage({ word: '我们' }, { fetchImpl: fakeFetch, model: 'img/model' });
      expect(buf.byteLength).toBeGreaterThan(0);
      expect(calls[0].url).toMatch(/\/chat\/completions$/);
      const body = JSON.parse(calls[0].init.body as string);
      expect(body.model).toBe('img/model');
      expect(body.modalities).toEqual(['image', 'text']);
    });
  });

  test('retries the transient "no image" response', async () => {
    await withKey(async () => {
      let n = 0;
      const fakeFetch = (async () => {
        n++;
        return n === 1 ? chatNoImage() : chatWithImage();
      }) as unknown as FetchLike;

      const buf = await generateWordImage({ word: '我们' }, { fetchImpl: fakeFetch, attempts: 2 });
      expect(buf.byteLength).toBeGreaterThan(0);
      expect(n).toBe(2);
    });
  });
});

describe('cleanSentence / isValidSentence', () => {
  test('cleanSentence takes the first non-empty line and strips quotes', () => {
    expect(cleanSentence('“我们是朋友。”')).toBe('我们是朋友。');
    expect(cleanSentence('\n  我们一起走。\nextra')).toBe('我们一起走。');
  });

  test('cleanSentence strips reasoning-model <think> traces', () => {
    expect(cleanSentence('<think>let me think…</think>\n时间到了。')).toBe('时间到了。');
    expect(cleanSentence('时间到了。</think>时间到了。')).toBe('时间到了。'); // stray closing tag (leaked reasoning)
    expect(cleanSentence('<think>still thinking with no answer')).toBe(''); // truncated reasoning → empty
  });

  test('isValidSentence accepts Chinese using the word, rejects English / missing word / empty', () => {
    expect(isValidSentence('我们是朋友。', '我们')).toBe(true);
    expect(isValidSentence('We are friends', '我们')).toBe(false); // Latin → English caption
    expect(isValidSentence('你好世界。', '我们')).toBe(false); // doesn't use the word
    expect(isValidSentence('', '我们')).toBe(false);
  });
});

describe('generateExampleSentence', () => {
  test('returns the cleaned sentence from the text LLM and disables reasoning', async () => {
    const provider = new MockLlmProvider('我们是好朋友。');
    expect(await generateExampleSentence(provider, '我们')).toBe('我们是好朋友。');
    expect(provider.calls[0].reasoning).toBe(false); // no thinking needed for a one-liner
  });

  test('retries past an invalid (English) response, then succeeds', async () => {
    const provider = new MockLlmProvider(['Here is a sentence about us', '我们一起上学。']);
    expect(await generateExampleSentence(provider, '我们')).toBe('我们一起上学。');
    expect(provider.calls.length).toBe(2);
  });

  test('throws when no attempt yields a valid sentence', async () => {
    const provider = new MockLlmProvider('always english');
    await expect(generateExampleSentence(provider, '我们', { attempts: 2 })).rejects.toThrow();
  });
});
