import { inArray } from 'drizzle-orm';
import type { Db } from '../lib/db.js';
import { characters } from '../db/schema.js';
import { fromPastedText, selfDeclareHsk } from '../lib/placement/index.js';
import { createLearner } from '../lib/learner/crud.js';
import { BOOTSTRAP_THRESHOLD, seedLearner } from '../lib/learner/seed.js';
import { buildCurriculum } from '../lib/grading/curriculum.js';
import { buildAllowlist } from '../lib/allowlist/index.js';
import { generateGradedStory } from '../lib/generation/generate.js';
import type { AttemptDiagnostics, GenerationMeta, StoryJson } from '../lib/generation/types.js';
import type { LlmProvider } from '../lib/llm/index.js';
import { selectDue, selectTargets } from '../evals/select.js';

// End-to-end orchestration: a learner profile → a scored, validated story. Pure glue
// over placement → seed → curriculum/allowlist → generation. Shared by the `pnpm story`
// CLI and the gated integration test. Targets/due use the Phase-6 stand-in (evals/select.ts).

const NOW = 1_750_000_000_000;

export interface Profile {
  method: 'hsk' | 'paste' | 'bootstrap';
  hsk?: number;
  paste?: string;
  bootstrapKnown?: number; // default 30
  targets: number;
  due: number;
  theme?: string;
  lengthChars?: number;
  maxWords?: number;
  minSentenceCoverage?: number;
  coverageBand?: number;
  model?: string;
}

export interface ProfileInfo {
  method: string;
  knownCount: number;
  targetChars: string[];
  dueChars: string[];
  bootstrap: boolean;
  allowedChars: Set<string>;
}

export interface ProfileRun {
  story: StoryJson;
  meta: GenerationMeta;
  info: ProfileInfo;
}

function resolveKnown(db: Db, profile: Profile): { known: number[]; method: 'hsk' | 'paste' | 'zero' } {
  switch (profile.method) {
    case 'hsk':
      return { known: selfDeclareHsk(db, profile.hsk ?? 1), method: 'hsk' };
    case 'paste':
      return { known: fromPastedText(db, profile.paste ?? '').knownCharIds, method: 'paste' };
    case 'bootstrap':
      return { known: buildCurriculum(db).slice(0, profile.bootstrapKnown ?? 30), method: 'zero' };
  }
}

function resolveChars(db: Db, ids: number[]): string[] {
  if (ids.length === 0) return [];
  const rows = db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.id, ids)).all();
  const map = new Map(rows.map((r) => [r.id, r.char]));
  return ids.map((id) => map.get(id)).filter((c): c is string => c != null);
}

/** Seed an ephemeral learner from `profile`, pick targets/due, and generate a scored story. */
export async function generateForProfile(
  db: Db,
  llm: LlmProvider,
  profile: Profile,
  opts: { onAttempt?: (info: AttemptDiagnostics) => void } = {},
): Promise<ProfileRun> {
  const { known, method } = resolveKnown(db, profile);
  const learnerId = createLearner(db, `cli-${profile.method}`, {}, NOW).id;
  seedLearner(db, learnerId, known, method, NOW);

  const knownSet = new Set(known);
  const bootstrap = known.length < BOOTSTRAP_THRESHOLD;
  const targetCharIds = selectTargets(db, knownSet, profile.targets);
  const dueCharIds = selectDue(db, learnerId, profile.due);

  const { allowedChars, targetChars } = buildAllowlist(db, learnerId, targetCharIds, { maxWords: profile.maxWords });

  const { story, meta } = await generateGradedStory(db, llm, learnerId, {
    targetCharIds,
    dueCharIds,
    theme: profile.theme,
    lengthChars: profile.lengthChars,
    maxWords: profile.maxWords,
    minSentenceCoverage: profile.minSentenceCoverage,
    coverageBand: profile.coverageBand,
    bootstrap,
    model: profile.model,
    onAttempt: opts.onAttempt,
  });

  return {
    story,
    meta,
    info: {
      method,
      knownCount: known.length,
      targetChars,
      dueChars: resolveChars(db, dueCharIds),
      bootstrap,
      allowedChars,
    },
  };
}
