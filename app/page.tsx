import Link from 'next/link';
import { db } from '@/lib/db';
import { listLearners } from '@/lib/learner/crud';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default function Home() {
  const learners = listLearners(db);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hanzi Graded Reader</h1>
        <Button render={<Link href="/learners/new">New learner</Link>} />
      </div>

      {learners.length === 0 ? (
        <p className="text-muted-foreground">No learners yet. Create one to start reading.</p>
      ) : (
        <ul className="grid gap-3">
          {learners.map((l) => (
            <li key={l.id}>
              <Link href={`/learners/${l.id}`}>
                <Card className="transition-colors hover:bg-muted">
                  <CardHeader>
                    <CardTitle>{l.displayName}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {l.settings.placementMethod ? `placement: ${l.settings.placementMethod}` : 'unplaced'}
                    {l.settings.bootstrap ? ' · bootstrap' : ''}
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
