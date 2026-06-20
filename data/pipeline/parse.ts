import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { SOURCES, isHan, decodeGb18030 } from './lib';

function srcPath(key: string): string {
  const s = SOURCES.find((x) => x.key === key);
  if (!s) throw new Error(`unknown source ${key}`);
  return s.path;
}

export interface MmahEntry {
  character: string;
  pinyin: string[];
  definition?: string;
  decomposition?: string;
  radical?: string;
  etymology?: { type?: string; phonetic?: string; semantic?: string; hint?: string };
}

/** makemeahanzi dictionary.txt → char → entry. Includes radical/component glyphs. */
export function parseMakemeahanzi(): Map<string, MmahEntry> {
  const text = readFileSync(srcPath('makemeahanzi_dictionary'), 'utf8');
  const map = new Map<string, MmahEntry>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as MmahEntry;
    map.set(e.character, e);
  }
  return map;
}

/**
 * makemeahanzi graphics.txt → char → { stroke count, serialized stroke data }. The lines are already
 * in hanzi-writer's data shape; we keep the count (for `stroke_count`) and the `{strokes, medians}`
 * JSON (for `stroke_data`, drives the stroke-order animation), dropping the redundant `character` key.
 */
export function parseGraphics(): Map<string, { count: number; data: string }> {
  const text = readFileSync(srcPath('makemeahanzi_graphics'), 'utf8');
  const map = new Map<string, { count: number; data: string }>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as { character: string; strokes: string[]; medians: number[][][] };
    map.set(e.character, { count: e.strokes.length, data: JSON.stringify({ strokes: e.strokes, medians: e.medians }) });
  }
  return map;
}

export interface CedictResult {
  /** simplified headword → merged pinyin + glosses */
  words: Map<string, { pinyin: string; glosses: string[] }>;
  /** every Han char seen in a simplified headword = the Simplified universe */
  simplifiedChars: Set<string>;
}

const CEDICT_LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;

/** CC-CEDICT → keyed on the Simplified headword (Traditional discarded, §5.2). */
export function parseCedict(): CedictResult {
  const gz = readFileSync(srcPath('cedict'));
  const text = gunzipSync(gz).toString('utf8');
  const words = new Map<string, { pinyin: string; glosses: string[] }>();
  const simplifiedChars = new Set<string>();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = CEDICT_LINE.exec(line);
    if (!m) continue;
    const simp = m[2];
    const pinyin = m[3];
    const glosses = m[4].split('/').filter(Boolean);
    for (const ch of simp) if (isHan(ch)) simplifiedChars.add(ch);
    const existing = words.get(simp);
    if (existing) existing.glosses.push(...glosses);
    else words.set(simp, { pinyin, glosses: [...glosses] });
  }
  return { words, simplifiedChars };
}

export interface HskResult {
  wordHsk: Map<string, number>; // word → HSK level (1..7)
  wordFreq: Map<string, number>; // word → frequency rank
  charHsk: Map<string, number>; // char → min HSK level of any containing word
  hsk1Chars: Set<string>; // chars appearing in any HSK-1 word
}

interface HskItem {
  simplified: string;
  level: string[]; // e.g. ["new-1"], ["new-7","old-6"]
  frequency: number;
}

/** drkameleon complete.json (HSK 3.0 "new" bands). */
export function parseHsk(): HskResult {
  const items = JSON.parse(readFileSync(srcPath('hsk'), 'utf8')) as HskItem[];
  const wordHsk = new Map<string, number>();
  const wordFreq = new Map<string, number>();
  const charHsk = new Map<string, number>();
  const hsk1Chars = new Set<string>();
  for (const it of items) {
    const levels = it.level
      .filter((l) => l.startsWith('new-'))
      .map((l) => parseInt(l.slice('new-'.length), 10))
      .filter((n) => Number.isFinite(n));
    if (levels.length === 0) continue; // old-only entries excluded from HSK 3.0 bands
    const lvl = Math.min(...levels);
    const word = it.simplified;
    wordHsk.set(word, Math.min(wordHsk.get(word) ?? Infinity, lvl));
    if (Number.isFinite(it.frequency)) wordFreq.set(word, it.frequency);
    for (const ch of word) {
      if (!isHan(ch)) continue;
      charHsk.set(ch, Math.min(charHsk.get(ch) ?? Infinity, lvl));
      if (lvl === 1) hsk1Chars.add(ch);
    }
  }
  return { wordHsk, wordFreq, charHsk, hsk1Chars };
}

/** Jun Da modern character frequency (GB18030) → char → rank (1 = most frequent). */
export function parseJunda(): Map<string, number> {
  const buf = readFileSync(srcPath('junda_char_freq'));
  const text = decodeGb18030(buf);
  const map = new Map<string, number>();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('/*')) continue;
    const cols = t.split(/\s+/);
    const rank = parseInt(cols[0], 10);
    const ch = cols[1];
    if (!Number.isFinite(rank) || !ch || ch.length !== 1 || !isHan(ch)) continue;
    if (!map.has(ch)) map.set(ch, rank);
  }
  return map;
}
