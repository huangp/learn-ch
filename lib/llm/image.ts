import type { LlmProvider } from './provider';

// Mnemonic art + example sentence — produced offline (see `art/build.ts`), not wired into the
// generation engine. IMAGE and SENTENCE are TWO SEPARATE calls: the image comes from a multimodal
// image model (ART_MODEL, e.g. google/gemini-3.1-flash-image) via OpenRouter chat/completions; the
// Chinese example sentence comes from the regular text LLM (`LlmProvider` / LLM_MODEL). They were once
// combined in one multimodal call, but the image model's text channel just CAPTIONS the image in
// English instead of writing the requested sentence — so the sentence is generated separately, where a
// text model follows instructions reliably (and is validated below).

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// Google Gemini Flash Image — multimodal (returns the image in message.images[]). Override with ART_MODEL.
export const DEFAULT_ART_MODEL = 'google/gemini-3.1-flash-image';

export interface WordImageInput {
  word: string;
  pinyin?: string | null;
  gloss?: string | null;
}

/** Injectable fetch — lets the unit test run without network. */
export type FetchLike = typeof fetch;

// ---- image ----------------------------------------------------------------------------------------

/** A kid-friendly mnemonic-illustration prompt for an 11–15yo learner (§17.1). */
export function imagePrompt({ word, pinyin, gloss }: WordImageInput): string {
  const meaning = gloss ? ` meaning "${gloss}"` : '';
  const sound = pinyin ? ` (pinyin: ${pinyin})` : '';
  return (
    `Create a simple, friendly mnemonic illustration that helps an 11–15 year old English-speaking ` +
    `student remember the Chinese word "${word}"${sound}${meaning}. ` +
    `Depict the meaning literally and memorably as a single clear scene or object. ` +
    `Flat, colorful, modern cartoon style, clean plain background, square composition. ` +
    `Do not put any text, letters, or written characters in the image.`
  );
}

/** Decode the first image (a `data:…;base64,…` URL) from a chat message's `images[]`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractImageBytes(message: any): Buffer {
  const url = message?.images?.[0]?.image_url?.url;
  if (typeof url !== 'string') throw new Error('no image in response (expected message.images[].image_url.url)');
  const m = /^data:.+?;base64,(.*)$/s.exec(url);
  if (!m) throw new Error('image is not a base64 data URL');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.byteLength === 0) throw new Error('decoded image is empty');
  return buf;
}

/** Generate a mnemonic image for a word. Retries the transient "no image" the model sometimes returns. */
export async function generateWordImage(
  input: WordImageInput,
  opts: { model?: string; fetchImpl?: FetchLike; attempts?: number } = {},
): Promise<Buffer> {
  const model = opts.model ?? process.env.ART_MODEL ?? DEFAULT_ART_MODEL;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const attempts = opts.attempts ?? 2;
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('No API key set — set LLM_API_KEY (or OPENROUTER_API_KEY) for art generation.');
  const baseURL = process.env.LLM_BASE_URL ?? OPENROUTER_BASE_URL;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/hanzi-graded-reader',
          'X-Title': 'Hanzi Graded Reader',
        },
        body: JSON.stringify({ model, modalities: ['image', 'text'], messages: [{ role: 'user', content: imagePrompt(input) }] }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`image request failed: HTTP ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return extractImageBytes((await res.json() as any)?.choices?.[0]?.message);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---- sentence -------------------------------------------------------------------------------------

/**
 * Strip reasoning-model "think" traces from the text. Handles a full `<think>…</think>` block, a stray
 * trailing `</think>` (reasoning leaked before the answer → keep what's after it), and an unclosed
 * `<think>` (reasoning truncated after the answer → keep what's before it).
 */
export function stripReasoning(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, ' ');
  const close = t.toLowerCase().lastIndexOf('</think>');
  if (close !== -1) t = t.slice(close + '</think>'.length);
  const open = t.toLowerCase().indexOf('<think>');
  if (open !== -1) t = t.slice(0, open);
  return t;
}

/** First non-empty line of the model's text (reasoning stripped), with surrounding quotes removed. */
export function cleanSentence(text: string): string {
  const line = stripReasoning(text).split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return line.replace(/^["“”'`]+|["“”'`]+$/g, '').trim();
}

/** A usable example sentence: Chinese (has Han), no Latin letters (rejects English captions), uses the word. */
export function isValidSentence(s: string, word: string): boolean {
  return s.length > 0 && /\p{Script=Han}/u.test(s) && !/[A-Za-z]/.test(s) && s.includes(word);
}

export function sentencePrompt(word: string): string {
  return (
    `Write ONE short, simple, natural Simplified-Chinese sentence (for a beginner, ≤ 25 characters) ` +
    `that uses the word "${word}" and reflects it's meaning concisely. Output the sentence text ONLY — no pinyin, no translation, no ` +
    `quotation marks, no labels, no explanation, and nothing else.`
  );
}

const SENTENCE_SYSTEM =
  'You write a single short, simple example sentence in Simplified Chinese for a beginner learner. Reply with the sentence only.';

/** Generate + validate a Chinese example sentence via the text LLM. Retries invalid output; throws if none pass. */
export async function generateExampleSentence(
  provider: LlmProvider,
  word: string,
  opts: { attempts?: number } = {},
): Promise<string> {
  const attempts = opts.attempts ?? 3;
  let last = '';
  for (let i = 0; i < attempts; i++) {
    const { text } = await provider.generate({
      system: SENTENCE_SYSTEM,
      messages: [{ role: 'user', content: sentencePrompt(word) }],
      // A one-line sentence needs no thinking — disable reasoning (saves tokens, no <think> leak).
      // `cleanSentence`/`isValidSentence` below stay as a fallback for models that ignore the flag.
      reasoning: false,
      maxTokens: 1024,
      temperature: 0.7,
    });
    const s = cleanSentence(text);
    if (isValidSentence(s, word)) return s;
    last = s;
  }
  throw new Error(`no valid Chinese sentence after ${attempts} attempts (last: ${JSON.stringify(last).slice(0, 80)})`);
}
