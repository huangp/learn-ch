import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { db } from '../lib/db';
import { createLlmProvider } from '../lib/llm/index';
import { generateExampleSentence, generateWordImage, isValidSentence } from '../lib/llm/image';
import { ART_WORDS_DIR, loadManifest, saveManifest, selectWords, sha256, toWebp, wordImagePath } from './lib';

// `pnpm art:build [--limit N] [--hsk 3] [--force] [--sentence]` — for each common multi-char word,
// generate a mnemonic image (ART_MODEL, image model) and a short Chinese example sentence (the text
// LLM_MODEL) in TWO separate calls, writing the image to /public/art/words/<id>.webp and recording both
// in the manifest. Resumable: a word needs work if it lacks an image, lacks a sentence, OR its stored
// sentence is invalid (e.g. an English image-caption from the old single-call approach) — so this run
// auto-heals polluted entries. Words that already have an image get a sentence-only call (the image is
// not regenerated). `--sentence` forces a sentence refresh (text-only, images untouched) for EVERY word
// that already has an image, even if its current sentence looks valid. The manifest is saved after each
// step; a per-word failure is logged and skipped.

async function main() {
  const { values } = parseArgs({
    options: {
      limit: { type: 'string' },
      hsk: { type: 'string' },
      force: { type: 'boolean' },
      sentence: { type: 'boolean' }, // force-refresh sentences only (no image work)
    },
  });
  const limit = values.limit != null ? Number(values.limit) : undefined;
  const hsk = values.hsk != null ? Number(values.hsk) : 3; // default scope: HSK 1–3
  const force = Boolean(values.force);
  const sentenceOnly = Boolean(values.sentence);

  const manifest = loadManifest();
  const hasImageFile = (id: number) => existsSync(wordImagePath(id).abs);
  const needsWork = (word: string) => {
    const e = manifest.images[word];
    // --sentence: refresh the sentence for every word that already has an image (never make images)
    if (sentenceOnly) return !!e && hasImageFile(e.id);
    if (force) return true;
    if (!e || !hasImageFile(e.id)) return true; // missing image
    return !e.sentence || !isValidSentence(e.sentence, word); // missing or invalid sentence
  };

  const all = selectWords(db, { hsk });
  const todo = all.filter((w) => needsWork(w.word));
  const batch = limit != null ? todo.slice(0, limit) : todo;

  const skipped = all.length - todo.length;
  console.log(
    `art:build${sentenceOnly ? ' (sentence refresh)' : ''} — ${all.length} candidate words (HSK ≤ ${hsk}); ` +
      `${skipped} skipped, ${batch.length} to do${limit != null ? ` (capped at ${limit})` : ''}.`,
  );
  if (batch.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  mkdirSync(ART_WORDS_DIR, { recursive: true });
  // Text model for the example sentence: SENTENCE_MODEL if set (use a cheap, non-reasoning model —
  // sentences don't need thinking), else the regular LLM_MODEL.
  const provider = createLlmProvider({ model: process.env.SENTENCE_MODEL });
  const started = Date.now();
  let images = 0;
  let sentences = 0;
  let failed = 0;
  let bytesOut = 0;

  for (const [i, w] of batch.entries()) {
    const existing = manifest.images[w.word];
    const withImage = !sentenceOnly && (force || !existing || !hasImageFile(existing.id));
    const tag = `[${i + 1}/${batch.length}] ${w.word} (#${w.id})${withImage ? '' : ' (sentence only)'}`;
    try {
      let entry = existing ?? { id: w.id, path: wordImagePath(w.id).url, bytes: 0, sha256: '' };

      if (withImage) {
        const webp = await toWebp(await generateWordImage({ word: w.word, pinyin: w.pinyin, gloss: w.gloss }));
        const { abs, url } = wordImagePath(w.id);
        writeFileSync(abs, webp);
        entry = { ...entry, id: w.id, path: url, bytes: webp.byteLength, sha256: sha256(webp) };
        manifest.images[w.word] = entry; // persist the image BEFORE the sentence call so it can't be orphaned
        saveManifest(manifest);
        images++;
        bytesOut += webp.byteLength;
      }

      try {
        const sentence = await generateExampleSentence(provider, w.word);
        entry = { ...entry, sentence };
        manifest.images[w.word] = entry;
        saveManifest(manifest);
        sentences++;
        console.log(`✓ ${tag} — ${sentence}`);
      } catch (se) {
        const msg = se instanceof Error ? se.message : String(se);
        if (withImage) {
          console.log(`✓ ${tag} — image only (sentence failed: ${msg})`);
        } else {
          failed++;
          console.error(`✗ ${tag} — ${msg}`);
        }
      }
    } catch (e) {
      failed++;
      console.error(`✗ ${tag} — image: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `Done in ${secs}s — ${images} images, ${sentences} sentences, ${failed} failed, ${skipped} skipped; ` +
      `${(bytesOut / 1024 / 1024).toFixed(1)} MB written.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
