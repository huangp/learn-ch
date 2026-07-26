import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getLearner } from '@/lib/learner/crud';
import { canAccessLearner } from '@/lib/auth/access';
import { getSessionContext } from '@/lib/auth/session';
import { getPersona } from '@/lib/persona/presets';
import { getGenre } from '@/lib/genres/presets';
import { listStoriesForLearner, type StoryRecord } from '@/lib/story/persist';
import { getStoryReadCounts } from '@/lib/interactions/stats';
import { estimateReadingMinutes } from '@/lib/story/reading-time';
import { flattenThread, groupIntoThreads } from '@/lib/story/thread';
import { selectSlideshowWords, SLIDESHOW_PRELOAD_COUNT } from '@/lib/slideshow/select';
import { GenerateStoryForm } from '@/components/GenerateStoryForm';
import { DeleteStoryButton } from '@/components/DeleteStoryButton';
import { SeedLibrary } from '@/components/SeedLibrary';
import { SignOutButton } from '@/components/SignOutButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toast';

export const dynamic = 'force-dynamic';

// Series indentation: 12px per depth level, capped so a long series never starves the card of
// width. Beyond the cap parts align; the `Part N` title prefix still conveys depth.
const INDENT_STEP = 12;
const MAX_INDENT = 96;

function StoryCard({
  story,
  learnerId,
  part,
  readCount,
  permanent,
  isAdult,
}: {
  story: StoryRecord;
  learnerId: number;
  part?: number;
  readCount: number;
  permanent: boolean;
  isAdult: boolean;
}) {
  // Finished (read) stories collapse to a quiet title-only card so unread ones stand out.
  const read = readCount > 0;
  // Parent-uploaded stories get a subtle labeled frame (a friendly nudge that a human picked this).
  const uploaded = story.meta?.model === 'upload';

  const cardInner = (
    <Link href={`/learners/${learnerId}/read/${story.id}`}>
      <Card
        size={read ? 'sm' : 'default'}
        className={uploaded ? 'rounded-lg ring-0 transition-colors hover:bg-muted' : 'transition-colors hover:bg-muted'}
      >
        <CardHeader>
          <CardTitle className={read ? 'pr-16 text-base text-muted-foreground' : 'pr-16 text-base'}>
            {part != null ? <span className="mr-2 text-muted-foreground">Part {part}</span> : null}
            {story.title ?? 'Untitled'}
          </CardTitle>
        </CardHeader>
        {read ? null : (
          <CardContent className="text-sm text-muted-foreground">
            ~{estimateReadingMinutes(story.hanzi)} min
            <br />
            targets: {story.targetChars.join(' ') || '—'}
            {story.meta ? ` · coverage ${(story.meta.knownCoverage * 100).toFixed(0)}%` : ''}
            {story.meta?.belowTarget ? ' · draft' : ''}
          </CardContent>
        )}
      </Card>
    </Link>
  );

  return (
    <div className="relative">
      {uploaded ? (
        <fieldset className="rounded-xl border border-primary/40 px-1 pb-1">
          <legend className="ml-3 px-1.5 text-xs font-medium text-primary">
            {isAdult ? 'Shared by you' : 'Recommended by your parent'}
          </legend>
          {cardInner}
        </fieldset>
      ) : (
        cardInner
      )}
      <div className="absolute right-2 top-2">
        <DeleteStoryButton storyId={story.id} learnerId={learnerId} permanent={permanent} />
      </div>
    </div>
  );
}

export default async function LearnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const learnerId = Number(id);
  const ctx = await getSessionContext();
  if (!ctx || !canAccessLearner(db, ctx, learnerId)) notFound();
  const learner = getLearner(db, learnerId);
  if (!learner) notFound();

  const stories = listStoriesForLearner(db, learnerId);
  const readCounts = getStoryReadCounts(db, learnerId);
  const { threads, singletons } = groupIntoThreads(stories);
  const persona = getPersona(learner.settings.personaId);
  const genre = getGenre(learner.settings.genreId);
  const slides = selectSlideshowWords(db, learnerId, SLIDESHOW_PRELOAD_COUNT);

  return (
    <Toaster>
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{learner.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {learner.settings.placementMethod ?? 'unplaced'}
            {learner.settings.bootstrap ? ' · bootstrap' : ''}
            {persona ? ` · ${persona.emoji} ${persona.name}` : ''}
            {genre ? ` · ${genre.emoji} ${genre.label}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" render={<Link href={`/learners/${learnerId}/progress`}>Progress</Link>} />
          {ctx.kind === 'adult' && (
            <>
              <Button variant="ghost" render={<Link href={`/learners/${learnerId}/settings`}>Settings</Link>} />
              <Button variant="ghost" render={<Link href="/">All learners</Link>} />
            </>
          )}
          <SignOutButton />
        </div>
      </div>

      <div className="mb-8 grid gap-8">
        <GenerateStoryForm learnerId={learnerId} slides={slides} />
        <SeedLibrary learnerId={learnerId} slides={slides} />
      </div>

      <h2 className="mb-3 text-lg font-medium">Stories</h2>
      {stories.length === 0 ? (
        <p className="text-muted-foreground">No stories yet. Generate one above.</p>
      ) : (
        <div className="grid gap-6">
          {threads.map((thread) => {
            const nodes = flattenThread(thread);
            return (
              <div key={thread.story.id} className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium text-muted-foreground">
                  Series: {thread.story.title ?? 'Untitled'} · {nodes.length} parts
                </p>
                <ul className="grid gap-3">
                  {nodes.map((node) => (
                    <li key={node.story.id} style={{ marginLeft: Math.min((node.part - 1) * INDENT_STEP, MAX_INDENT) }}>
                      <StoryCard
                        story={node.story}
                        learnerId={learnerId}
                        part={node.part}
                        readCount={readCounts.get(node.story.id) ?? 0}
                        permanent={ctx.kind === 'adult'}
                        isAdult={ctx.kind === 'adult'}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {singletons.length > 0 ? (
            <ul className="grid gap-3">
              {singletons.map((s) => (
                <li key={s.id}>
                  <StoryCard
                    story={s}
                    learnerId={learnerId}
                    readCount={readCounts.get(s.id) ?? 0}
                    permanent={ctx.kind === 'adult'}
                    isAdult={ctx.kind === 'adult'}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </main>
    </Toaster>
  );
}
