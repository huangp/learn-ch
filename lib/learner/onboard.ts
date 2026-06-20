import type { Db } from '../db';
import { fromPastedText, selfDeclareHsk, type PlacementMethod } from '../placement/index';
import { buildCurriculum } from '../grading/curriculum';
import { createLearner, getLearner, type Learner } from './crud';
import { seedLearner } from './seed';

// Phase 5 — onboarding glue: one of the placement resolvers (§16.1) → createLearner →
// seedLearner. Three of the four paths are wired (HSK / paste / zero); the toggle-grid
// is deferred. Mirrors `resolveKnown` in cli/run-profile.ts but persists a real learner.

export type OnboardMethod = 'hsk' | 'paste' | 'zero';

export interface OnboardInput {
  name: string;
  method: OnboardMethod;
  /** for method 'hsk' — known = all chars at/below this level (1..6). */
  hsk?: number;
  /** for method 'paste' — free text; its distinct Simplified chars become the known set. */
  paste?: string;
  /** for method 'zero' — seed the first N curriculum chars so bootstrap has a base (§16.4). */
  bootstrapKnown?: number;
  now?: number;
}

function resolveKnown(db: Db, input: OnboardInput): { known: number[]; method: PlacementMethod } {
  switch (input.method) {
    case 'hsk':
      return { known: selfDeclareHsk(db, input.hsk ?? 1), method: 'hsk' };
    case 'paste':
      return { known: fromPastedText(db, input.paste ?? '').knownCharIds, method: 'paste' };
    case 'zero':
      return { known: buildCurriculum(db).slice(0, input.bootstrapKnown ?? 30), method: 'zero' };
  }
}

/** Create + seed a learner from one of the three wired placement paths. */
export function onboardLearner(db: Db, input: OnboardInput): Learner {
  const { known, method } = resolveKnown(db, input);
  const learner = createLearner(db, input.name, {}, input.now);
  seedLearner(db, learner.id, known, method, input.now);
  // re-read so the returned learner carries the settings seedLearner just wrote
  // (placementMethod / frontierCharId / bootstrap).
  return getLearner(db, learner.id) ?? learner;
}
