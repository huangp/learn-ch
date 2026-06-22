import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getLearner } from '@/lib/learner/crud';
import { canAccessLearner } from '@/lib/auth/access';
import { getSessionContext } from '@/lib/auth/session';
import { getPersona } from '@/lib/persona/presets';
import { getGenre } from '@/lib/genres/presets';
import { listStoriesForLearner } from '@/lib/story/persist';
import { GenerateStoryForm } from '@/components/GenerateStoryForm';
import { SeedLibrary } from '@/components/SeedLibrary';
import { SignOutButton } from '@/components/SignOutButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function LearnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const learnerId = Number(id);
  const ctx = await getSessionContext();
  if (!ctx || !canAccessLearner(db, ctx, learnerId)) notFound();
  const learner = getLearner(db, learnerId);
  if (!learner) notFound();

  const stories = listStoriesForLearner(db, learnerId);
  const persona = getPersona(learner.settings.personaId);
  const genre = getGenre(learner.settings.genreId);

  return (
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
            <Button variant="ghost" render={<Link href="/">All learners</Link>} />
          )}
          <SignOutButton />
        </div>
      </div>

      <div className="mb-8 grid gap-8">
        <GenerateStoryForm learnerId={learnerId} />
        <SeedLibrary learnerId={learnerId} />
      </div>

      <h2 className="mb-3 text-lg font-medium">Stories</h2>
      {stories.length === 0 ? (
        <p className="text-muted-foreground">No stories yet. Generate one above.</p>
      ) : (
        <ul className="grid gap-3">
          {stories.map((s) => (
            <li key={s.id}>
              <Link href={`/learners/${learnerId}/read/${s.id}`}>
                <Card className="transition-colors hover:bg-muted">
                  <CardHeader>
                    <CardTitle className="text-base">{s.title ?? 'Untitled'}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    targets: {s.targetChars.join(' ') || '—'}
                    {s.meta ? ` · coverage ${(s.meta.knownCoverage * 100).toFixed(0)}%` : ''}
                    {s.parentStoryId ? ' · branch' : ''}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
