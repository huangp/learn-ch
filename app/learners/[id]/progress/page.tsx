import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getLearner } from '@/lib/learner/crud';
import { canAccessLearner } from '@/lib/auth/access';
import { getSessionContext } from '@/lib/auth/session';
import { getLearnerProgress } from '@/lib/progress/index';
import { ProgressBar } from '@/components/ProgressBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const learnerId = Number(id);
  const ctx = await getSessionContext();
  if (!ctx || !canAccessLearner(db, ctx, learnerId)) notFound();
  const learner = getLearner(db, learnerId);
  if (!learner) notFound();

  const p = getLearnerProgress(db, learnerId);
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{learner.displayName}</h1>
          <p className="text-sm text-muted-foreground">Progress</p>
        </div>
        <Button variant="ghost" render={<Link href={`/learners/${learnerId}`}>Back to stories</Link>} />
      </div>

      {/* Headline counter (§11 minimal gamification). */}
      <div className="mb-8">
        <p className="text-5xl font-semibold tabular-nums">{p.knownCount}</p>
        <p className="text-muted-foreground">characters you can now read</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Curriculum</CardTitle>
            <CardDescription>
              {p.knownCount} of {p.curriculumTotal} characters
              {p.frontierIndex != null ? ` · at position ${p.frontierIndex + 1}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ProgressBar value={p.curriculumPct} />
            <p className="text-sm text-muted-foreground">
              {p.statusCounts.learning} learning · {p.statusCounts.review} review · {p.statusCounts.mastered} mastered
              <span className="block text-xs">Mastered grows as you read and answer questions.</span>
            </p>
            <p className="text-sm text-muted-foreground">{p.storiesRead} stories read</p>
          </CardContent>
        </Card>

        {p.upcoming.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coming up next</CardTitle>
              <CardDescription>The next characters your stories will introduce.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {p.upcoming.map((c) => (
                  <span
                    key={c}
                    className="flex h-9 w-9 items-center justify-center rounded bg-muted text-lg text-foreground"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3">
          <h2 className="text-lg font-medium">Reward texts</h2>
          {p.rewardTexts.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>
                    {r.title} <span className="text-sm font-normal text-muted-foreground">· {r.author}</span>
                  </span>
                  {r.unlocked && <span className="text-sm font-medium text-primary">Unlocked</span>}
                </CardTitle>
                <CardDescription className="font-serif text-base text-foreground/70">{r.text}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <ProgressBar value={r.coverage} />
                <p className="text-sm text-muted-foreground">
                  {r.knownChars}/{r.totalChars} characters · {pct(r.coverage)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
