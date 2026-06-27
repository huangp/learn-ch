import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { and, asc, isNotNull, lte } from 'drizzle-orm';
import type { Db } from '../lib/db';
import { words } from '../db/schema';
import { ROOT, sha256 } from '../data/pipeline/lib';

// Helpers for `art:build` — pick the common words, write per-word images under /public/art, and
// track them in a manifest (mirrors the data/pipeline manifest+sha256 convention). Images are keyed
// by `words.id` (URL-safe ASCII filenames); the manifest maps the human-readable word to its file.

export const PUBLIC_ART = resolve(ROOT, 'public/art');
export const ART_WORDS_DIR = resolve(PUBLIC_ART, 'words');
export const ART_MANIFEST = resolve(PUBLIC_ART, 'manifest.json');

export interface ArtEntry {
  id: number;
  path: string; // app URL, e.g. /art/words/42.webp
  bytes: number;
  sha256: string;
  sentence?: string; // short Chinese example sentence using the word
}
export interface ArtManifest {
  version: number;
  images: Record<string, ArtEntry>; // keyed by word
}

export function loadManifest(): ArtManifest {
  if (!existsSync(ART_MANIFEST)) return { version: 1, images: {} };
  return JSON.parse(readFileSync(ART_MANIFEST, 'utf8')) as ArtManifest;
}

export function saveManifest(m: ArtManifest): void {
  mkdirSync(PUBLIC_ART, { recursive: true });
  // stable key order keeps git diffs clean as words are added across runs
  const images = Object.fromEntries(Object.entries(m.images).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(ART_MANIFEST, JSON.stringify({ ...m, images }, null, 2));
}

export interface WordRow {
  id: number;
  word: string;
  pinyin: string | null;
  gloss: string | null;
  freqRank: number | null;
}

/**
 * Common MULTI-CHARACTER words ordered most-frequent first; optionally capped to an HSK band.
 * Mnemonic art is for vocabulary, not bare characters (single-char words like 的/了 are excluded —
 * those already have stroke animation + gloss in the reader).
 */
export function selectWords(db: Db, opts: { hsk?: number } = {}): WordRow[] {
  const conds = [isNotNull(words.freqRank)];
  if (opts.hsk != null) conds.push(lte(words.hskLevel, opts.hsk));
  return db
    .select({ id: words.id, word: words.word, pinyin: words.pinyin, gloss: words.gloss, freqRank: words.freqRank })
    .from(words)
    .where(and(...conds))
    .orderBy(asc(words.freqRank))
    .all()
    .filter((r) => [...r.word].length > 1); // multi-char vocabulary only (Unicode-correct)
}

export function wordImagePath(id: number): { abs: string; url: string } {
  return { abs: resolve(ART_WORDS_DIR, `${id}.webp`), url: `/art/words/${id}.webp` };
}

/** Compress/normalize raw model bytes (PNG) to a small square webp. */
export async function toWebp(raw: Buffer): Promise<Buffer> {
  return sharp(raw).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
}

export { sha256 };
