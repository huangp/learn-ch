import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, rmSync } from 'node:fs';
import { DB_PATH, MIGRATIONS, ensureRaw, idsComponents, isHan } from './lib';
import {
  parseMakemeahanzi,
  parseGraphics,
  parseCedict,
  parseHsk,
  parseJunda,
} from './parse';

async function main() {
  await ensureRaw();

  console.log('Parsing raw sources…');
  const mmah = parseMakemeahanzi();
  const graphics = parseGraphics();
  const { words: cedictWords, simplifiedChars } = parseCedict();
  const { wordHsk, wordFreq, charHsk, hsk1Chars } = parseHsk();
  const junda = parseJunda();
  console.log(
    `  makemeahanzi=${mmah.size} graphics=${graphics.size} cedict=${cedictWords.size} ` +
      `simplifiedChars=${simplifiedChars.size} hskWords=${wordHsk.size} jundaChars=${junda.size}`,
  );

  // --- build the character set: real simplified chars present in makemeahanzi,
  //     then expand to include their (teachable) components so no edge is orphaned.
  const real = new Set<string>();
  for (const ch of simplifiedChars) if (mmah.has(ch)) real.add(ch);
  for (const ch of charHsk.keys()) if (mmah.has(ch)) real.add(ch);
  for (const ch of junda.keys()) if (mmah.has(ch)) real.add(ch);

  const charSet = new Set(real);
  const worklist = [...real];
  while (worklist.length) {
    const c = worklist.pop()!;
    const entry = mmah.get(c);
    for (const comp of idsComponents(entry?.decomposition)) {
      if (mmah.has(comp) && !charSet.has(comp)) {
        charSet.add(comp);
        worklist.push(comp);
      }
    }
  }
  console.log(`  character set: ${charSet.size} (seed ${real.size} + ${charSet.size - real.size} components)`);

  // --- fresh DB + schema via migrations
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });

  const insChar = sqlite.prepare(
    `INSERT INTO characters (char, pinyin, gloss, radical, stroke_count, stroke_data, decomposition, hsk_level, freq_rank, is_component)
     VALUES (@char, @pinyin, @gloss, @radical, @stroke_count, @stroke_data, @decomposition, @hsk_level, @freq_rank, 0)`,
  );
  const insEdge = sqlite.prepare(
    `INSERT OR IGNORE INTO char_components (char_id, component_id, role) VALUES (?, ?, ?)`,
  );
  const insWord = sqlite.prepare(
    `INSERT OR IGNORE INTO words (word, chars, pinyin, gloss, hsk_level, freq_rank)
     VALUES (@word, @chars, @pinyin, @gloss, @hsk_level, @freq_rank)`,
  );
  const markComponent = sqlite.prepare(`UPDATE characters SET is_component = 1 WHERE id = ?`);

  const charId = new Map<string, number>();

  const seed = sqlite.transaction(() => {
    // characters
    for (const ch of charSet) {
      const e = mmah.get(ch)!;
      const cedict = cedictWords.get(ch);
      const pinyin = e.pinyin?.length ? e.pinyin : cedict ? cedict.pinyin.split(/\s+/) : [];
      const gloss = e.definition ?? cedict?.glosses.join('; ') ?? null;
      const decomposition = e.decomposition && e.decomposition !== '？' ? e.decomposition : null;
      const info = insChar.run({
        char: ch,
        pinyin: JSON.stringify(pinyin),
        gloss,
        radical: e.radical ?? null,
        stroke_count: graphics.get(ch)?.count ?? null,
        stroke_data: graphics.get(ch)?.data ?? null,
        decomposition,
        hsk_level: charHsk.get(ch) ?? null,
        freq_rank: junda.get(ch) ?? null,
      });
      charId.set(ch, Number(info.lastInsertRowid));
    }

    // component edges
    const componentIds = new Set<number>();
    let skipped = 0;
    for (const ch of charSet) {
      const e = mmah.get(ch)!;
      const id = charId.get(ch)!;
      const seen = new Set<string>();
      const sem = e.etymology?.semantic;
      const phon = e.etymology?.phonetic;
      for (const comp of idsComponents(e.decomposition)) {
        if (comp === ch) continue;
        const compId = charId.get(comp);
        if (compId === undefined) {
          skipped++;
          continue;
        }
        const role = comp === sem ? 'semantic' : comp === phon ? 'phonetic' : 'structural';
        const key = `${comp}|${role}`;
        if (seen.has(key)) continue;
        seen.add(key);
        insEdge.run(id, compId, role);
        componentIds.add(compId);
      }
    }
    for (const id of componentIds) markComponent.run(id);

    // words (Simplified, all-Han headwords only)
    for (const [word, { pinyin, glosses }] of cedictWords) {
      if (![...word].every(isHan) || word.length === 0) continue;
      insWord.run({
        word,
        chars: JSON.stringify([...word]),
        pinyin,
        gloss: glosses.join('; ').slice(0, 500) || null,
        hsk_level: wordHsk.get(word) ?? null,
        freq_rank: wordFreq.get(word) ?? null,
      });
    }

    return { componentCount: componentIds.size, skippedEdges: skipped };
  });

  const { componentCount, skippedEdges } = seed();

  const count = (t: string) => (sqlite.prepare(`SELECT count(*) c FROM ${t}`).get() as { c: number }).c;
  console.log('✓ build complete:');
  console.log(`  characters      ${count('characters')}  (components: ${componentCount})`);
  console.log(`  char_components ${count('char_components')}  (skipped non-char glyphs: ${skippedEdges})`);
  console.log(`  words           ${count('words')}`);
  console.log(`  HSK1 chars      ${hsk1Chars.size}`);
  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
