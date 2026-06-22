import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getLearner } from '@/lib/learner/crud';
import { canAccessLearner } from '@/lib/auth/access';
import { getSessionContext } from '@/lib/auth/session';
import { getPersona } from '@/lib/persona/presets';
import { getStory } from '@/lib/story/persist';
import { Reader } from '@/components/Reader';
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

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6">
        <Button variant="ghost" render={<Link href={`/learners/${learnerId}`}>← {learner.displayName}</Link>} />
      </div>
      <Reader
        storyId={story.id}
        learnerId={learnerId}
        title={story.title}
        segments={story.segments}
        questions={story.questions}
        choices={story.choices}
        bootstrap={learner.settings.bootstrap === true}
        persona={persona}
      />
    </main>
  );
}
