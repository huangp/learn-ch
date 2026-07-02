import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getLearner } from '@/lib/learner/crud';
import { canAccessLearner } from '@/lib/auth/access';
import { getSessionContext } from '@/lib/auth/session';
import { getPersona } from '@/lib/persona/presets';
import { getKnownChars } from '@/lib/allowlist/index';
import { getStory, listStoriesForLearner } from '@/lib/story/persist';
import { annotate } from '@/lib/annotate/index';
import { computeStoryStats } from '@/lib/story/stats';
import { getThreadContext } from '@/lib/story/thread';
import { selectSlideshowWords, SLIDESHOW_PRELOAD_COUNT } from '@/lib/slideshow/select';
import { Reader } from '@/components/Reader';
import { StoryMeta } from '@/components/StoryMeta';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function ReadPage({ params }: { params: Promise<{ id: string; storyId: string }> }) {
  const { id, storyId } = await params;
  const learnerId = Number(id);
  const ctx = await getSessionContext();
  if (!ctx || !canAccessLearner(db, ctx, learnerId)) notFound();
  const learner = getLearner(db, learnerId);
  const story = getStory(db, Number(storyId));
  if (!learner || !story || story.learnerId !== learnerId) notFound();

  const persona = getPersona(learner.settings.personaId) ?? null;
  const stats = computeStoryStats(story.hanzi, getKnownChars(db, learnerId));

  const thread = getThreadContext(listStoriesForLearner(db, learnerId), story.id);
  const inSeries = thread != null && (thread.parent != null || thread.children.length > 0);

  // Annotate the title / questions / choices at render time (deterministic pinyin-pro + CC-CEDICT,
  // no LLM heteronym pass — fine for short chrome text) so they get the same tap-to-reveal as the
  // body. Works for already-saved stories; no schema/persistence change.
  const titleSegments = story.title ? annotate(db, story.title) : null;
  const questions = story.questions.map((q) => ({
    ...q,
    qSegments: annotate(db, q.q),
    optionSegments: q.options.map((o) => annotate(db, o)),
  }));
  const choices = story.choices.map((c) => ({ ...c, labelSegments: annotate(db, c.label) }));
  const slides = selectSlideshowWords(db, learnerId, SLIDESHOW_PRELOAD_COUNT);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6">
        <Button variant="ghost" render={<Link href={`/learners/${learnerId}`}>← {learner.displayName}</Link>} />
      </div>
      {inSeries ? (
        <div className="mb-6 space-y-1 text-sm">
          <p className="font-medium text-muted-foreground">Part {thread.part}</p>
          {thread.parent ? (
            <p>
              <Link href={`/learners/${learnerId}/read/${thread.parent.id}`} className="text-primary hover:underline">
                ← Continues from: {thread.parent.title ?? 'Untitled'}
              </Link>
            </p>
          ) : null}
          {thread.children.length > 0 ? (
            <p className="text-muted-foreground">
              Continued in:{' '}
              {thread.children.map((c, i) => (
                <span key={c.id}>
                  {i > 0 ? ' · ' : ''}
                  <Link href={`/learners/${learnerId}/read/${c.id}`} className="text-primary hover:underline">
                    {c.title ?? 'Untitled'} →
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
      {story.meta?.belowTarget ? (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This story was a best effort — a few characters may be new or harder than usual.
        </div>
      ) : null}
      <StoryMeta stats={stats} model={story.meta?.model ?? null} reusedFrom={story.meta?.reusedFromLearnerName ?? null} />
      <Reader
        storyId={story.id}
        learnerId={learnerId}
        titleSegments={titleSegments}
        segments={story.segments}
        questions={questions}
        choices={choices}
        slides={slides}
        bootstrap={learner.settings.bootstrap === true}
        persona={persona}
        captureInteractions={ctx.kind === 'child'}
      />
    </main>
  );
}
