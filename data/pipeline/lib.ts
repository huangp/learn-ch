import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '../..');
export const RAW = resolve(ROOT, 'data/raw');
export const DB_PATH = resolve(ROOT, 'data/hanzi.db');
export const MIGRATIONS = resolve(ROOT, 'db/migrations');
export const MANIFEST = resolve(RAW, 'manifest.json');

export interface Source {
  key: string;
  url: string;
  path: string;
  binary: boolean; // download as bytes (no utf-8 assumption); used for .gz and GB18030
}

export const SOURCES: Source[] = [
  {
    key: 'makemeahanzi_dictionary',
    url: 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt',
    path: resolve(RAW, 'makemeahanzi/dictionary.txt'),
    binary: false,
  },
  {
    key: 'makemeahanzi_graphics',
    url: 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt',
    path: resolve(RAW, 'makemeahanzi/graphics.txt'),
    binary: false,
  },
  {
    key: 'cedict',
    url: 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz',
    path: resolve(RAW, 'cedict/cedict.txt.gz'),
    binary: true,
  },
  {
    key: 'hsk',
    url: 'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json',
    path: resolve(RAW, 'hsk/complete.json'),
    binary: false,
  },
  {
    key: 'junda_char_freq',
    // Modern Chinese character frequency list (GB18030-encoded, tab-delimited).
    url: 'https://lingua.mtsu.edu/chinese-computing/statistics/char/download.php?Which=MO',
    path: resolve(RAW, 'freq/junda_char.txt'),
    binary: true,
  },
];

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function fetchToFile(src: Source): Promise<void> {
  mkdirSync(dirname(src.path), { recursive: true });
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`Download failed for ${src.key}: HTTP ${res.status} ${src.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0) throw new Error(`Empty download for ${src.key}: ${src.url}`);
  writeFileSync(src.path, buf);
}

/** Download all sources (force re-download) and write a checksum manifest. */
export async function download(): Promise<void> {
  const manifest: Record<string, { url: string; bytes: number; sha256: string }> = {};
  for (const src of SOURCES) {
    process.stdout.write(`↓ ${src.key} … `);
    await fetchToFile(src);
    const buf = readFileSync(src.path);
    manifest[src.key] = { url: src.url, bytes: buf.byteLength, sha256: sha256(buf) };
    console.log(`${(buf.byteLength / 1024).toFixed(0)} KB`);
  }
  mkdirSync(RAW, { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`✓ manifest written → ${MANIFEST}`);
}

/** Download only if any source file is missing. */
export async function ensureRaw(): Promise<void> {
  const missing = SOURCES.filter((s) => !existsSync(s.path) || statSync(s.path).size === 0);
  if (missing.length === 0) return;
  console.log(`Raw data missing (${missing.map((m) => m.key).join(', ')}); downloading…`);
  await download();
}

// ---- text helpers ----

const IDS_OP = (cp: number) => cp >= 0x2ff0 && cp <= 0x2fff; // IDS operators ⿰⿱…

/** A single Han character (excludes IDS operators, punctuation, radicals-supplement). */
export function isHan(ch: string): boolean {
  return /\p{Script=Han}/u.test(ch);
}

/**
 * Extract candidate component characters from an IDS decomposition string,
 * dropping IDS operators, '？'/'?' placeholders, and whitespace. Membership in
 * the makemeahanzi entry set is filtered by the caller (sub-glyph minutiae that
 * are not themselves teachable characters are ignored — §6.1).
 */
export function idsComponents(decomp: string | null | undefined): string[] {
  if (!decomp || decomp === '？') return [];
  const out: string[] = [];
  for (const ch of decomp) {
    const cp = ch.codePointAt(0)!;
    if (IDS_OP(cp)) continue;
    if (ch === '？' || ch === '?' || ch.trim() === '') continue;
    out.push(ch);
  }
  return out;
}

/** Decode GB18030 bytes to a JS string (Node full-ICU). */
export function decodeGb18030(buf: Buffer): string {
  return new TextDecoder('gb18030').decode(buf);
}
