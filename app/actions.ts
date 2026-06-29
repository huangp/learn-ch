'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { createLlmProvider } from '@/lib/llm/index';
import { onboardLearner, type OnboardMethod } from '@/lib/learner/onboard';
import { updateLearner } from '@/lib/learner/crud';
import { setChildCredentials, CredentialError } from '@/lib/learner/credentials';
import { generateAndPersistStory } from '@/lib/story/generate';
import { markWordsKnown } from '@/lib/learner/mark-known';
import { selectSlideshowWords, DEFAULT_SLIDE_COUNT, type Slide } from '@/lib/slideshow/select';
import { getStory, hardDeleteStory, softDeleteStory } from '@/lib/story/persist';
import { recordCompletion, recordDwell, recordInteraction, type InteractionType } from '@/lib/interactions/record';
import { gradeStory } from '@/lib/srs/grade';
import { getCharDetail, getWordDetail, type CharDetail, type WordDetail } from '@/lib/char/detail';
import { getStrokeData, type StrokeData } from '@/lib/char/strokes';
import { assertLearnerAccess, assertStoryAccess } from '@/lib/auth/access';
import { requireAdult, requireSession } from '@/lib/auth/session';

// Phase 5 server actions — thin wrappers over the lib service layer. All DB/LLM access
// is server-side only (better-sqlite3 + the Anthropic key never reach the client).
// Every learner-scoped action authorizes the session BEFORE any DB/LLM work (plan Part B4).

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
  const ctx = await requireAdult();
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

  const learner = onboardLearner(db, { name, method, hsk, paste, cutoffFreqRank, gridKnown, gridUnknown, personaId, genreId, ownerId: ctx.userId });
  revalidatePath('/');
  redirect(`/learners/${learner.id}`);
}

export async function generateStoryAction(
  learnerId: number,
  theme?: string,
  genreId?: string,
): Promise<{ storyId: number }> {
  assertLearnerAccess(db, await requireSession(), learnerId);
  const llm = createLlmProvider();
  const story = await generateAndPersistStory(db, llm, learnerId, {
    theme: theme?.trim() || undefined,
    genreId: genreId || undefined,
  });
  // Don't redirect here — the waiting-modal slideshow stays open until the learner clicks
  // "Start reading" (the client navigates). Returns the new story id for that navigation.
  revalidatePath(`/learners/${learnerId}`);
  return { storyId: story.id };
}

/** Next batch of waiting-slideshow words, excluding ones already shown (see lib/slideshow/select). */
export async function loadMoreSlidesAction(learnerId: number, exclude: string[]): Promise<Slide[]> {
  assertLearnerAccess(db, await requireSession(), learnerId);
  return selectSlideshowWords(db, learnerId, DEFAULT_SLIDE_COUNT, exclude);
}

/** Mark slideshow words as known (additive placement refinement; see lib/learner/mark-known). */
export async function markWordsKnownAction(learnerId: number, knownWords: string[]): Promise<void> {
  assertLearnerAccess(db, await requireSession(), learnerId);
  if (knownWords.length === 0) return;
  markWordsKnown(db, learnerId, knownWords);
  revalidatePath(`/learners/${learnerId}`);
}

export async function generateFromSeedAction(
  learnerId: number,
  seedId: string,
): Promise<{ storyId: number }> {
  assertLearnerAccess(db, await requireSession(), learnerId);
  const llm = createLlmProvider();
  const story = await generateAndPersistStory(db, llm, learnerId, { seedId });
  // Like generateStoryAction — don't redirect; the slideshow modal stays open until the learner
  // clicks "Start reading" (the client navigates). Returns the new story id for that navigation.
  revalidatePath(`/learners/${learnerId}`);
  return { storyId: story.id };
}

export async function chooseBranchAction(storyId: number, seed: string, label: string): Promise<void> {
  const ctx = await requireSession();
  assertStoryAccess(db, ctx, storyId);
  const parent = getStory(db, storyId);
  if (!parent) throw new Error(`story ${storyId} not found`);
  // An adult is previewing/curating, not the learner — don't record their reading as a completion.
  if (ctx.kind !== 'adult') recordCompletion(db, { storyId, learnerId: parent.learnerId }); // branching concludes the parent reading
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

// Reading-signal capture is the LEARNER's. An adult session owns/reviews the learner but isn't the
// learner, so its reading must never pollute their stats/FSRS — these actions no-op for adults.
export async function recordInteractionAction(input: {
  storyId: number;
  learnerId: number;
  char?: string;
  type: InteractionType;
  value?: number;
}): Promise<void> {
  const ctx = await requireSession();
  assertLearnerAccess(db, ctx, input.learnerId);
  assertStoryAccess(db, ctx, input.storyId);
  if (ctx.kind === 'adult') return; // adult is previewing — don't record reading signals
  recordInteraction(db, input);
}

export async function recordDwellAction(input: {
  storyId: number;
  learnerId: number;
  chars: string[];
  valueMs: number;
}): Promise<void> {
  const ctx = await requireSession();
  assertLearnerAccess(db, ctx, input.learnerId);
  assertStoryAccess(db, ctx, input.storyId);
  if (ctx.kind === 'adult') return; // adult is previewing — don't record reading signals
  recordDwell(db, input);
}

export async function gradeStoryAction(learnerId: number, storyId: number): Promise<void> {
  const ctx = await requireSession();
  assertLearnerAccess(db, ctx, learnerId);
  assertStoryAccess(db, ctx, storyId);
  if (ctx.kind === 'adult') return; // adult preview — no completion / grading
  recordCompletion(db, { storyId, learnerId }); // a concluded reading (counts toward read total)
  gradeStory(db, learnerId, storyId);
  revalidatePath(`/learners/${learnerId}`);
}

/**
 * Delete a story. An adult (curating) deletes permanently — the row + its interactions cascade away.
 * A child (the learner) soft-deletes — hidden from their list/reader, but interactions + progress kept.
 */
export async function deleteStoryAction(learnerId: number, storyId: number): Promise<void> {
  const ctx = await requireSession();
  assertLearnerAccess(db, ctx, learnerId);
  assertStoryAccess(db, ctx, storyId);
  if (ctx.kind === 'adult') hardDeleteStory(db, storyId);
  else softDeleteStory(db, storyId);
  revalidatePath(`/learners/${learnerId}`);
}

/** Adult edits a learner's display name + default persona / genre (no schema; merges settings). */
export async function updateLearnerSettingsAction(
  learnerId: number,
  patch: { displayName?: string; personaId?: string; genreId?: string },
): Promise<void> {
  const ctx = await requireAdult();
  assertLearnerAccess(db, ctx, learnerId);
  const displayName = patch.displayName?.trim() || undefined;
  updateLearner(db, learnerId, {
    displayName,
    settings: { personaId: patch.personaId, genreId: patch.genreId ?? '' },
  });
  revalidatePath(`/learners/${learnerId}`);
  revalidatePath(`/learners/${learnerId}/settings`);
}

/** Adult sets/resets a child's direct-login username + PIN. Returns an error string or null. */
export async function setChildCredentialsAction(
  learnerId: number,
  username: string,
  pin: string,
): Promise<string | null> {
  const ctx = await requireAdult();
  assertLearnerAccess(db, ctx, learnerId);
  try {
    setChildCredentials(db, learnerId, username, pin);
  } catch (e) {
    if (e instanceof CredentialError) return e.message;
    throw e;
  }
  revalidatePath('/');
  return null;
}

export async function getCharDetailAction(char: string): Promise<CharDetail | null> {
  return getCharDetail(db, char);
}

export async function getWordDetailAction(word: string): Promise<WordDetail> {
  return getWordDetail(db, word);
}

export async function getStrokeDataAction(char: string): Promise<StrokeData | null> {
  return getStrokeData(db, char);
}
