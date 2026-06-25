import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getLearner } from '@/lib/learner/crud';
import { canAccessLearner } from '@/lib/auth/access';
import { getSessionContext } from '@/lib/auth/session';
import { SettingsForm } from '@/components/SettingsForm';
import { ChildCredentialsForm } from '@/components/ChildCredentialsForm';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const learnerId = Number(id);
  const ctx = await getSessionContext();
  // Adults only — unlike progress/placement, settings is not child-readable.
  if (!ctx || ctx.kind !== 'adult' || !canAccessLearner(db, ctx, learnerId)) notFound();
  const learner = getLearner(db, learnerId);
  if (!learner) notFound();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{learner.displayName}</h1>
          <p className="text-sm text-muted-foreground">Settings</p>
        </div>
        <Button variant="ghost" render={<Link href={`/learners/${learnerId}`}>Back to stories</Link>} />
      </div>

      <SettingsForm
        learnerId={learnerId}
        displayName={learner.displayName}
        personaId={learner.settings.personaId}
        genreId={learner.settings.genreId}
      />

      <div className="mt-8 grid gap-2">
        <h2 className="text-lg font-medium">Reader login</h2>
        <ChildCredentialsForm learnerId={learnerId} currentUsername={learner.username} />
      </div>
    </main>
  );
}
