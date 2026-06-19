// §9 annotation — heteronym detection (pure; no DB/network). The candidate readings
// for a char come from pinyin-pro (`multiple:true`), NOT characters.pinyin — the DB
// stores only one reading even for true heteronyms (行→["xíng"]), so it's useless here.

import { pinyin } from 'pinyin-pro';

const cache = new Map<string, string[]>();

/** All valid toned readings for a single char (length 1 ⇒ monophonic). Memoized. */
export function candidatesFor(char: string): string[] {
  let c = cache.get(char);
  if (c === undefined) {
    c = pinyin(char, { multiple: true, type: 'array', toneType: 'symbol' });
    cache.set(char, c);
  }
  return c;
}

// Ultra-common polyphonic chars whose default (first) reading is overwhelmingly the
// right one in running text. Excluded from LLM candidacy so the fallback isn't spammed
// with — and doesn't risk regressing — grammatical particles.
export const SAFE_PARTICLES = new Set<string>([
  '的', '了', '着', '不', '一', '个', '们', '子', '地', '得', '和', '是', '这', '那', '为', '么',
]);

/**
 * A "hard case" worth sending to the LLM: the char is a heteronym, isn't a safe
 * particle, and pinyin-pro left it on its default (first) reading — i.e. it did not
 * disambiguate by context (the 还书→hái failure mode). Cases where pinyin-pro moved
 * off the default (银行→háng, 重复→chóng) are trusted and skipped.
 */
export function isHardCase(char: string, chosenPinyin: string): boolean {
  if (SAFE_PARTICLES.has(char)) return false;
  const cands = candidatesFor(char);
  return cands.length > 1 && chosenPinyin === cands[0];
}
