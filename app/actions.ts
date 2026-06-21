'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { createLlmProvider } from '@/lib/llm/index';
import { onboardLearner, type OnboardMethod } from '@/lib/learner/onboard';
import { generateAndPersistStory } from '@/lib/story/generate';
import { getStory } from '@/lib/story/persist';
import { recordDwell, recordInteraction, type InteractionType } from '@/lib/interactions/record';
import { gradeStory } from '@/lib/srs/grade';
import { getCharDetail, type CharDetail } from '@/lib/char/detail';
import { getStrokeData, type StrokeData } from '@/lib/char/strokes';

// Phase 5 server actions — thin wrappers over the lib service layer. All DB/LLM access
// is server-side only (better-sqlite3 + the Anthropic key never reach the client).

function parseJsonStringArray(raw: FormDataEntryValue | null): string[] | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : undefined;
  } catch {
    return undefined;
  }
}

export async function onboardLearnerAction(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim() || 'Reader';
  const method = String(formData.get('method') ?? 'hsk') as OnboardMethod;
  const hsk = Number(formData.get('hsk') ?? 3);
  const paste = String(formData.get('paste') ?? '');

  const cutoffRaw = formData.get('cutoffFreqRank');
  const cutoffFreqRank = typeof cutoffRaw === 'string' && cutoffRaw !== '' ? Number(cutoffRaw) : undefined;
  const gridKnown = parseJsonStringArray(formData.get('gridKnown'));
  const gridUnknown = parseJsonStringArray(formData.get('gridUnknown'));
  const personaId = String(formData.get('personaId') ?? '') || undefined;
  const genreId = String(formData.get('genreId') ?? '') || undefined;

  const learner = onboardLearner(db, { name, method, hsk, paste, cutoffFreqRank, gridKnown, gridUnknown, personaId, genreId });
  revalidatePath('/');
  redirect(`/learners/${learner.id}`);
}

export async function generateStoryAction(learnerId: number, theme?: string, genreId?: string): Promise<void> {
  const llm = createLlmProvider();
  const story = await generateAndPersistStory(db, llm, learnerId, {
    theme: theme?.trim() || undefined,
    genreId: genreId || undefined,
  });
  revalidatePath(`/learners/${learnerId}`);
  redirect(`/learners/${learnerId}/read/${story.id}`);
}

export async function generateFromSeedAction(learnerId: number, seedId: string): Promise<void> {
  const llm = createLlmProvider();
  const story = await generateAndPersistStory(db, llm, learnerId, { seedId });
  revalidatePath(`/learners/${learnerId}`);
  redirect(`/learners/${learnerId}/read/${story.id}`);
}

export async function chooseBranchAction(storyId: number, seed: string, label: string): Promise<void> {
  const parent = getStory(db, storyId);
  if (!parent) throw new Error(`story ${storyId} not found`);
  const llm = createLlmProvider();
  const next = await generateAndPersistStory(db, llm, parent.learnerId, {
    theme: label,
    priorStory: parent.hanzi,
    parentStoryId: parent.id,
    seed,
  });
  revalidatePath(`/learners/${parent.learnerId}`);
  redirect(`/learners/${parent.learnerId}/read/${next.id}`);
}

export async function recordInteractionAction(input: {
  storyId: number;
  learnerId: number;
  char?: string;
  type: InteractionType;
  value?: number;
}): Promise<void> {
  recordInteraction(db, input);
}

export async function recordDwellAction(input: {
  storyId: number;
  learnerId: number;
  chars: string[];
  valueMs: number;
}): Promise<void> {
  recordDwell(db, input);
}

export async function gradeStoryAction(learnerId: number, storyId: number): Promise<void> {
  gradeStory(db, learnerId, storyId);
  revalidatePath(`/learners/${learnerId}`);
}

export async function getCharDetailAction(char: string): Promise<CharDetail | null> {
  return getCharDetail(db, char);
}

export async function getStrokeDataAction(char: string): Promise<StrokeData | null> {
  return getStrokeData(db, char);
}
