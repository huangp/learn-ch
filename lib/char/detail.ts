import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { charComponents, characters } from '../../db/schema';

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
