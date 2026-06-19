import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { DB_PATH, MANIFEST } from './lib.js';
import { parseHsk } from './parse.js';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`✗ DB not found at ${DB_PATH} — run \`pnpm data:build\` first.`);
    process.exit(1);
  }
  const db = new Database(DB_PATH, { readonly: true });
  const one = <T>(sql: string): T => db.prepare(sql).get() as T;
  const checks: Check[] = [];

  const charCount = one<{ c: number }>('SELECT count(*) c FROM characters').c;
  checks.push({ name: 'characters populated', ok: charCount > 3000, detail: `${charCount} rows` });

  const wordCount = one<{ c: number }>('SELECT count(*) c FROM words').c;
  checks.push({ name: 'words (lexicon) populated', ok: wordCount > 50000, detail: `${wordCount} rows` });

  const edgeCount = one<{ c: number }>('SELECT count(*) c FROM char_components').c;
  checks.push({ name: 'IDS component edges populated', ok: edgeCount > 1000, detail: `${edgeCount} edges` });

  // no orphan edges: every char_id / component_id resolves to a characters row
  const orphans = one<{ c: number }>(
    `SELECT count(*) c FROM char_components cc
     WHERE NOT EXISTS (SELECT 1 FROM characters x WHERE x.id = cc.char_id)
        OR NOT EXISTS (SELECT 1 FROM characters x WHERE x.id = cc.component_id)`,
  ).c;
  checks.push({ name: 'no orphan component edges', ok: orphans === 0, detail: `${orphans} orphans` });

  // every role is one of the allowed values
  const badRoles = one<{ c: number }>(
    `SELECT count(*) c FROM char_components WHERE role NOT IN ('semantic','phonetic','structural')`,
  ).c;
  checks.push({ name: 'edge roles valid', ok: badRoles === 0, detail: `${badRoles} invalid` });

  // freq populated for a healthy share of characters (Jun Da covers ~9.9k common chars)
  const withFreq = one<{ c: number }>('SELECT count(*) c FROM characters WHERE freq_rank IS NOT NULL').c;
  checks.push({ name: 'frequency populated', ok: withFreq > 3000, detail: `${withFreq} chars ranked` });

  // HSK populated on chars and words
  const charHsk = one<{ c: number }>('SELECT count(*) c FROM characters WHERE hsk_level IS NOT NULL').c;
  const wordHsk = one<{ c: number }>('SELECT count(*) c FROM words WHERE hsk_level IS NOT NULL').c;
  checks.push({ name: 'HSK levels populated', ok: charHsk > 1000 && wordHsk > 5000, detail: `${charHsk} chars, ${wordHsk} words` });

  // every HSK1 char is resolvable in the characters table
  const { hsk1Chars } = parseHsk();
  const hasChar = db.prepare('SELECT 1 FROM characters WHERE char = ?');
  const missingHsk1 = [...hsk1Chars].filter((ch) => !hasChar.get(ch));
  checks.push({
    name: 'every HSK1 char resolvable',
    ok: missingHsk1.length === 0,
    detail: missingHsk1.length ? `missing: ${missingHsk1.join('')}` : `all ${hsk1Chars.size} present`,
  });

  // strokeCount populated for most characters
  const withStrokes = one<{ c: number }>('SELECT count(*) c FROM characters WHERE stroke_count IS NOT NULL').c;
  checks.push({ name: 'stroke counts populated', ok: withStrokes > charCount * 0.9, detail: `${withStrokes}/${charCount}` });

  // reproducibility manifest present
  checks.push({ name: 'checksum manifest present', ok: existsSync(MANIFEST), detail: MANIFEST });

  db.close();

  let failed = 0;
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name} — ${c.detail}`);
    if (!c.ok) failed++;
  }
  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll Phase 0 acceptance checks passed.');
}

main();
