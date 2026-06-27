import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { charComponents, characters, words } from '../../db/schema';
import { cedictToToned } from '../annotate/cedict';
import { getArtEntry } from '../art/manifest';

const HAN = /\p{Script=Han}/u;

// Phase 5 — character detail for the tap-to-reveal panel (§6.3). Pure DB read: pinyin +
// gloss for the char plus its component breakdown (the "妈 = 女 + 马" Socratic hook),
// joined from char_components → characters.

export interface CharComponent {
  char: string;
  role: string; // 'semantic' | 'phonetic' | 'structural'
  gloss: string | null;
}

export interface CharDetail {
  char: string;
  pinyin: string[];
  gloss: string | null;
  components: CharComponent[];
}

function parsePinyin(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Lookup a character's readings, gloss, and component breakdown (null if unknown). */
export function getCharDetail(db: Db, char: string): CharDetail | null {
  const row = db
    .select({ id: characters.id, pinyin: characters.pinyin, gloss: characters.gloss })
    .from(characters)
    .where(eq(characters.char, char))
    .get();
  if (!row) return null;

  const components = db
    .select({ char: characters.char, role: charComponents.role, gloss: characters.gloss })
    .from(charComponents)
    .innerJoin(characters, eq(charComponents.componentId, characters.id))
    .where(eq(charComponents.charId, row.id))
    .all();

  return {
    char,
    pinyin: parsePinyin(row.pinyin),
    gloss: row.gloss,
    components,
  };
}

/** Word-level detail for the tap-to-reveal panel (§6.3) — word pinyin/gloss + per-char breakdown. */
export interface WordDetail {
  word: string;
  /** Toned word reading from the lexicon (CC-CEDICT), when available. */
  pinyin: string | null;
  /** Word gloss from the lexicon, when available. */
  gloss: string | null;
  /** Short Chinese example sentence, when the word has prebuilt art (from the committed manifest). */
  exampleSentence: string | null;
  /** Per-character breakdown (Han chars only), for components + stroke animation. */
  chars: CharDetail[];
}

/**
 * Look up a whole word: its lexicon pinyin + gloss plus each Han character's detail. Context-aware
 * tap-to-reveal resolves words (from the annotated segment) instead of bare chars, so 蝴蝶 shows
 * "húdié — butterfly" with 蝴 and 蝶 broken out, not two unrelated single-char lookups.
 */
export function getWordDetail(db: Db, word: string): WordDetail {
  const hanChars = [...word].filter((c) => HAN.test(c));
  const chars = hanChars.map((c) => getCharDetail(db, c)).filter((d): d is CharDetail => d != null);

  const row = db.select({ pinyin: words.pinyin, gloss: words.gloss }).from(words).where(eq(words.word, word)).get();
  const pinyin = row?.pinyin ? (cedictToToned(row.pinyin, hanChars.length)?.join(' ') ?? null) : null;

  return { word, pinyin, gloss: row?.gloss ?? null, exampleSentence: getArtEntry(word)?.sentence ?? null, chars };
}
