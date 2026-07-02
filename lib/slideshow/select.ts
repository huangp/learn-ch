import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters, learnerChars, words } from '../../db/schema';
import { selectNewChars } from '../grading/select';
import { artWords, getArtEntry } from '../art/manifest';

// Pick the vocab words shown in the story-generation waiting slideshow. Words that have a
// prebuilt image AND sit at the learner's frontier (readable + still teach something) come first;
// the most-common remaining art words backfill so the slideshow always has content. Pure DB read.

const KNOWN_STATUSES = ['learning', 'review', 'mastered'] as const;
// Wide horizon: look well past the immediate frontier to find art words the learner can already
// mostly read (the manifest holds ~640 multi-char words, so there's a deep pool to draw from).
const UPCOMING_HORIZON = 40;
export const DEFAULT_SLIDE_COUNT = 8;
// Deck preloaded server-side (before generation starts) so the waiting slideshow has enough distinct
// words to browse for the whole ~10–20s generation without a runtime loadMore — which, being a Next
// server action, would only queue behind the in-flight generation. Deep pool (636), so this is cheap.
export const SLIDESHOW_PRELOAD_COUNT = 48;

export interface Slide {
  word: string;
  imagePath: string;
  pinyin: string | null;
  gloss: string | null;
  sentence: string | null;
  charIds: number[];
}

const isHan = (c: string) => /\p{Script=Han}/u.test(c);

export function selectSlideshowWords(
  db: Db,
  learnerId: number,
  n: number = DEFAULT_SLIDE_COUNT,
  exclude: Iterable<string> = [],
): Slide[] {
  const artWordList = artWords();
  if (artWordList.length === 0 || n <= 0) return [];
  const skip = new Set(exclude);

  const knownIds = new Set(
    db
      .select({ charId: learnerChars.charId })
      .from(learnerChars)
      .where(and(eq(learnerChars.learnerId, learnerId), inArray(learnerChars.status, [...KNOWN_STATUSES])))
      .all()
      .map((r) => r.charId),
  );
  const upcomingIds = new Set(selectNewChars(db, learnerId, UPCOMING_HORIZON));

  // metadata for the art words that exist in the lexicon
  const rows = db
    .select({ word: words.word, pinyin: words.pinyin, gloss: words.gloss, freqRank: words.freqRank })
    .from(words)
    .where(inArray(words.word, artWordList))
    .all();

  // resolve every needed char string → id (one query)
  const wantChars = [...new Set(rows.flatMap((r) => [...r.word].filter(isHan)))];
  const charToId = new Map<string, number>();
  if (wantChars.length > 0) {
    for (const c of db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.char, wantChars)).all()) {
      charToId.set(c.char, c.id);
    }
  }

  type Cand = Slide & { freqRank: number | null; readable: boolean; teaches: boolean };
  const cands: Cand[] = [];
  for (const r of rows) {
    if (skip.has(r.word)) continue; // already shown in an earlier slideshow batch
    const entry = getArtEntry(r.word);
    if (!entry || entry.bytes <= 0) continue; // need a real image for the slide
    const hanChars = [...r.word].filter(isHan);
    if (hanChars.length <= 1) continue; // vocabulary only — skip any legacy single-char art
    const charIds = hanChars.map((c) => charToId.get(c)).filter((id): id is number => id != null);
    if (charIds.length === 0) continue;
    const readable = charIds.every((id) => knownIds.has(id) || upcomingIds.has(id));
    const teaches = charIds.some((id) => !knownIds.has(id));
    cands.push({
      word: r.word,
      imagePath: entry.path,
      pinyin: r.pinyin,
      gloss: r.gloss,
      sentence: entry.sentence ?? null,
      charIds,
      freqRank: r.freqRank,
      readable,
      teaches,
    });
  }

  const byFreq = (a: Cand, b: Cand) => (a.freqRank ?? Infinity) - (b.freqRank ?? Infinity);
  const chosen = cands.filter((c) => c.readable && c.teaches).sort(byFreq).slice(0, n);
  if (chosen.length < n) {
    const used = new Set(chosen.map((c) => c.word));
    chosen.push(...cands.filter((c) => !used.has(c.word)).sort(byFreq).slice(0, n - chosen.length));
  }
  return chosen.map(({ word, imagePath, pinyin, gloss, sentence, charIds }) => ({ word, imagePath, pinyin, gloss, sentence, charIds }));
}
