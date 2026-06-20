import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { characters } from '../../db/schema';

// Phase 5 — stroke-order data for the char panel's hanzi-writer animation (§11). Pure DB read of the
// `characters.stroke_data` column (seeded from makemeahanzi graphics.txt, already in hanzi-writer's
// shape). Kept separate from getCharDetail so the heavier JSON only loads when the animation mounts.

export interface StrokeData {
  strokes: string[]; // SVG path per stroke
  medians: number[][][]; // [stroke][point][x,y] — stroke centre-lines for animation
}

/** Lookup a character's stroke-order data (null if unknown or absent/unparseable). */
export function getStrokeData(db: Db, char: string): StrokeData | null {
  const row = db.select({ strokeData: characters.strokeData }).from(characters).where(eq(characters.char, char)).get();
  if (!row?.strokeData) return null;
  try {
    return JSON.parse(row.strokeData) as StrokeData;
  } catch {
    return null;
  }
}
