import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OnboardForm } from '@/components/OnboardForm';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { listFrequencyRankedChars } from '@/lib/placement/index';
import { getSessionContext } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function NewLearnerPage() {
  const ctx = await getSessionContext();
  if (ctx?.kind !== 'adult') redirect('/'); // children can't create profiles
  const gridChars = listFrequencyRankedChars(db);
  return (
    <main className="mx-auto max-w-xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New learner</h1>
        <Button variant="ghost" render={<Link href="/">Back</Link>} />
      </div>
      <OnboardForm gridChars={gridChars} />
    </main>
  );
}
