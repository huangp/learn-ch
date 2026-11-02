import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db';
import type { LlmProvider } from '../llm/index';
import { loadLexicon } from '../annotate/lexicon';
import { validateChars } from '../generation/validate';
import { readingInSentence, type RecognitionDraft } from './build';

// Optional LLM judge for the deterministic 组词/造句 drafts (./build.ts): one batched call that may
// swap in a more natural word or a clearer standalone sentence. Every change is validated — word
// contains the char and is in the lexicon, sentence contains the word and uses only allowed chars —
// and any failure keeps the draft. The model never supplies pinyin or glosses; options are built
// afterwards from the final sentence by finalizeRecognition.

// Plain filesystem path, same as lib/generation/prompt.ts (Turbopack-safe).
const SYSTEM = readFileSync(join(process.cwd(), 'prompts', 'recognition.system.md'), 'utf8');

const MAX_SENTENCE_CHARS = 30;

function stripFence(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/** Is the model's {word, sentence} for `char` acceptable as a replacement for `draft`? */
function acceptable(db: Db, draft: RecognitionDraft, word: string, sentence: string, allowed: Set<string>): boolean {
  const { char } = draft;
  const wordLen = [...word].length;
  if (!word.includes(char) || wordLen > 4) return false;
  if (wordLen > 1 && !loadLexicon(db).words.has(word)) return false;
  if (!sentence.includes(word) || [...sentence].length > MAX_SENTENCE_CHARS) return false;
  if (!validateChars(sentence, new Set([...allowed, char])).ok) return false;
  // Same reading as the draft sentence: the meaning answer is the gloss for that sense (e.g. 吧 as
  // the particle ba, not 酒吧 bā), so the model must not move the char to another reading.
  return readingInSentence(db, char, word, sentence) === readingInSentence(db, char, draft.word, draft.sentence);
}

/**
 * Refine drafts via one LLM call. Returns new drafts (input untouched); drafts the model didn't
 * improve validly pass through unchanged. Never throws on bad model output or a failed call.
 */
export async function refineRecognition(
  db: Db,
  llm: LlmProvider,
  drafts: RecognitionDraft[],
  allowed: Set<string>,
  opts: { model?: string } = {},
): Promise<RecognitionDraft[]> {
  if (drafts.length === 0) return drafts;
  const user =
    `ALLOWED CHARACTERS:\n${[...allowed].join('')}\n\n` +
    `ITEMS:\n` +
    JSON.stringify(drafts.map((d) => ({ char: d.char, word: d.word, sentence: d.sentence, alternatives: d.alternatives })));

  let picks: unknown;
  try {
    const res = await llm.generate({ system: SYSTEM, messages: [{ role: 'user', content: user }], model: opts.model, temperature: 0 });
    picks = JSON.parse(stripFence(res.text));
  } catch (e) {
    console.log(`[gen]   recognition refine skipped: ${(e as Error).message}`);
    return drafts;
  }
  if (!Array.isArray(picks)) return drafts;

  const byChar = new Map<string, { word: string; sentence: string }>();
  for (const p of picks) {
    if (p && typeof p.char === 'string' && typeof p.word === 'string' && typeof p.sentence === 'string') {
      byChar.set(p.char, { word: p.word.trim(), sentence: p.sentence.trim() });
    }
  }
  return drafts.map((d) => {
    const p = byChar.get(d.char);
    if (!p || (p.word === d.word && p.sentence === d.sentence)) return d;
    if (!acceptable(db, d, p.word, p.sentence, allowed)) return d;
    return { ...d, word: p.word, sentence: p.sentence, source: 'llm' };
  });
}
