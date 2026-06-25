import type { Db } from '../lib/db';
import { buildCurriculum } from '../lib/grading/curriculum';
import { selfDeclareHsk } from '../lib/placement/index';
import { createLearner } from '../lib/learner/crud';
import { seedLearner } from '../lib/learner/seed';
import { selectDueChars, selectNewChars } from '../lib/grading/select';
import type { LengthBand } from '../lib/generation/types';

// Eval fixtures (§12): a spread of learner profiles. Each is seeded in an ephemeral
// DB copy, then given targets/due via the Phase-6 selectors (lib/grading/select.ts),
// good enough to exercise generation.

const NOW = 1_750_000_000_000;

export interface EvalFixture {
  name: string;
  learnerId: number;
  targetCharIds: number[];
  dueCharIds: number[];
  bootstrap: boolean;
  lengthChars: LengthBand;
  themes: string[];
  /** Story seed id (§17.2) to retell, if this fixture exercises a seed. */
  seedId?: string;
}

/** First `n` curriculum chars (for the bootstrap profile's "already introduced" set). */
function firstCurriculum(db: Db, n: number): number[] {
  return buildCurriculum(db).slice(0, n);
}

export interface FixtureSpec {
  name: string;
  hsk?: number; // HSK self-declare level
  bootstrapKnown?: number; // bootstrap: seed the first N curriculum chars instead
  targets: number;
  maxDue: number;
  lengthChars: LengthBand;
  themes: string[];
  /** Story seed id (§17.2) to retell, if this spec exercises a seed. */
  seedId?: string;
}

export const FIXTURE_SPECS: FixtureSpec[] = [
  // Length bands follow docs/story_length.md by level (known-char bucket → band).
  { name: 'hsk1-early', hsk: 1, targets: 2, maxDue: 2, lengthChars: { min: 100, max: 200 }, themes: ['friendship', 'mystery'] },
  { name: 'hsk2', hsk: 2, targets: 3, maxDue: 3, lengthChars: { min: 250, max: 400 }, themes: ['adventure'] },
  { name: 'hsk3', hsk: 3, targets: 3, maxDue: 3, lengthChars: { min: 400, max: 650 }, themes: ['history (Mulan retold)'] },
  { name: 'hsk4-mid', hsk: 4, targets: 3, maxDue: 4, lengthChars: { min: 600, max: 950 }, themes: ['sci-fi'] },
  { name: 'bootstrap', bootstrapKnown: 30, targets: 2, maxDue: 0, lengthChars: { min: 40, max: 80 }, themes: ['friendship'] },
  // Seed-driven (§17.2): retell a history plot skeleton through the existing engine.
  { name: 'hsk3-seed-mulan', hsk: 3, targets: 3, maxDue: 3, lengthChars: { min: 400, max: 650 }, themes: [''], seedId: 'mulan' },
];

/** Materialize every spec into a runnable fixture (creates learners in `db`). */
export function buildFixtures(db: Db): EvalFixture[] {
  return FIXTURE_SPECS.map((spec) => {
    const learnerId = createLearner(db, spec.name, {}, NOW).id;
    let known: number[];
    let method: 'hsk' | 'zero';
    if (spec.bootstrapKnown != null) {
      known = firstCurriculum(db, spec.bootstrapKnown);
      method = 'zero';
    } else {
      known = selfDeclareHsk(db, spec.hsk!);
      method = 'hsk';
    }
    seedLearner(db, learnerId, known, method, NOW);
    const targetCharIds = selectNewChars(db, learnerId, spec.targets);
    const dueCharIds = spec.maxDue > 0 ? selectDueChars(db, learnerId, spec.maxDue) : [];
    return {
      name: spec.name,
      learnerId,
      targetCharIds,
      dueCharIds,
      bootstrap: spec.bootstrapKnown != null,
      lengthChars: spec.lengthChars,
      themes: spec.themes,
      seedId: spec.seedId,
    };
  });
}

export { NOW };
