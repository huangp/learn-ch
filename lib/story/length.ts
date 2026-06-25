import type { LengthBand } from '../generation/types';

// §15 #4 — the story-length curve. Length "grows with the learner": as the known-character
// count rises, stories get longer. The schedule is transcribed from docs/story_length.md
// (known-char buckets → length band). Pure + DB-free so the pedagogy is unit-testable.

/** [knownCount, minChars, maxChars] anchor points from docs/story_length.md. */
const LENGTH_CURVE: readonly (readonly [number, number, number])[] = [
  [80, 40, 80], // 0–80 (bootstrap)
  [150, 100, 200], // ~150 (HSK1)
  [300, 250, 400], // ~300 (HSK2)
  [500, 400, 650], // ~500 (HSK3)
  [900, 600, 950], // ~800–1000 (HSK4)
  [1350, 900, 1300], // ~1200–1500 (HSK4–5)
  [2000, 1300, 1800], // 2000+ (HSK5–6, capped)
];

const roundTo10 = (n: number) => Math.round(n / 10) * 10;

/** Linear interpolation of one column (min or max) of LENGTH_CURVE at `knownCount`. */
function interp(knownCount: number, col: 1 | 2): number {
  const first = LENGTH_CURVE[0];
  const last = LENGTH_CURVE[LENGTH_CURVE.length - 1];
  if (knownCount <= first[0]) return first[col];
  if (knownCount >= last[0]) return last[col];
  for (let i = 1; i < LENGTH_CURVE.length; i++) {
    const [hi] = LENGTH_CURVE[i];
    if (knownCount <= hi) {
      const [lo, , ] = LENGTH_CURVE[i - 1];
      const t = (knownCount - lo) / (hi - lo);
      return LENGTH_CURVE[i - 1][col] + t * (LENGTH_CURVE[i][col] - LENGTH_CURVE[i - 1][col]);
    }
  }
  return last[col]; // unreachable
}

/** Story-length band for a learner with `knownCount` known characters (§15 #4). */
export function deriveLengthBand(knownCount: number): LengthBand {
  return { min: roundTo10(interp(knownCount, 1)), max: roundTo10(interp(knownCount, 2)) };
}
