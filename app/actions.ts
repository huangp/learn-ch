'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { createLlmProvider } from '@/lib/llm/index';
import { onboardLearner, type OnboardMethod } from '@/lib/learner/onboard';
import { generateAndPersistStory } from '@/lib/story/generate';
import { getStory } from '@/lib/story/persist';
import { recordInteraction, type InteractionType } from '@/lib/interactions/record';
import { getCharDetail, type CharDetail } from '@/lib/char/detail';

// Phase 5 server actions — thin wrappers over the lib service layer. All DB/LLM access
// is server-side only (better-sqlite3 + the Anthropic key never reach the client).

export async function onboardLearnerAction(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim() || 'Reader';
  const method = String(formData.get('method') ?? 'hsk') as OnboardMethod;
  const hsk = Number(formData.get('hsk') ?? 3);
  const paste = String(formData.get('paste') ?? '');

  const learner = onboardLearner(db, { name, method, hsk, paste });
  revalidatePath('/');
  redirect(`/learners/${learner.id}`);
}

export async function generateStoryAction(learnerId: number, theme?: string): Promise<void> {
  const llm = createLlmProvider();
  const story = await generateAndPersistStory(db, llm, learnerId, { theme: theme?.trim() || undefined });
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
  });
  void seed; // the chosen branch label seeds the continuation theme; `seed` is reserved for future templating
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

export async function getCharDetailAction(char: string): Promise<CharDetail | null> {
  return getCharDetail(db, char);
}
