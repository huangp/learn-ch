import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { listAccessibleLearners } from '@/lib/auth/access';
import { getSessionContext } from '@/lib/auth/session';
import { ChildCredentialsForm } from '@/components/ChildCredentialsForm';
import { SignOutButton } from '@/components/SignOutButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (ctx.kind === 'child') redirect(`/learners/${ctx.learnerId}`); // readers go straight in

  const learners = listAccessibleLearners(db, ctx);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your readers</h1>
        <div className="flex items-center gap-1">
          <Button render={<Link href="/learners/new">New learner</Link>} />
          <SignOutButton />
        </div>
      </div>

      {learners.length === 0 ? (
        <p className="text-muted-foreground">No readers yet. Create one to start.</p>
      ) : (
        <ul className="grid gap-3">
          {learners.map((l) => (
            <li key={l.id}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Link href={`/learners/${l.id}`} className="hover:underline">
                      {l.displayName}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm text-muted-foreground">
                  <span>
                    {l.settings.placementMethod ? `placement: ${l.settings.placementMethod}` : 'unplaced'}
                    {l.settings.bootstrap ? ' · bootstrap' : ''}
                  </span>
                  <ChildCredentialsForm learnerId={l.id} currentUsername={l.username} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
