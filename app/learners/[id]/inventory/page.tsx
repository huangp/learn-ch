import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getLearner } from '@/lib/learner/crud';
import { canAccessLearner } from '@/lib/auth/access';
import { getSessionContext } from '@/lib/auth/session';
import { getKnownInventory, type InventoryColor, type InventoryItem } from '@/lib/progress/index';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

const cellColor: Record<InventoryColor, string> = {
  green: 'bg-green-100 text-green-900',
  yellow: 'bg-yellow-100 text-yellow-900',
  grey: 'bg-muted text-muted-foreground',
};

function Grid({ items, wide }: { items: InventoryItem[]; wide?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">None at this level.</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => (
        <span
          key={it.text}
          className={`flex h-9 items-center justify-center rounded text-lg ${wide ? 'min-w-9 px-2' : 'w-9'} ${cellColor[it.color]}`}
        >
          {it.text}
        </span>
      ))}
    </div>
  );
}

const knownOf = (items: InventoryItem[]) => items.filter((i) => i.color !== 'grey').length;

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ level?: string }>;
}) {
  const { id } = await params;
  const { level: levelParam } = await searchParams;
  const learnerId = Number(id);
  const ctx = await getSessionContext();
  if (!ctx || !canAccessLearner(db, ctx, learnerId)) notFound();
  const learner = getLearner(db, learnerId);
  if (!learner) notFound();

  const levels = getKnownInventory(db, learnerId);
  if (levels.length === 0) notFound();

  const requested = Number(levelParam);
  const active = levels.find((l) => l.level === requested) ?? levels[0];

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{learner.displayName}</h1>
          <p className="text-sm text-muted-foreground">Characters &amp; vocabulary</p>
        </div>
        <Button variant="ghost" render={<Link href={`/learners/${learnerId}/progress`}>Back to progress</Link>} />
      </div>

      {/* Tabs by HSK level. */}
      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {levels.map((l) => {
          const isActive = l.level === active.level;
          const known = knownOf(l.chars) + knownOf(l.words);
          const total = l.chars.length + l.words.length;
          return (
            <Link
              key={l.level}
              href={`?level=${l.level}`}
              className={`-mb-px rounded-t border-b-2 px-3 py-1.5 text-sm ${
                isActive
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {l.label} <span className="tabular-nums text-xs">({known}/{total})</span>
            </Link>
          );
        })}
      </div>

      {/* Legend. */}
      <div className="mb-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-green-100" /> mastered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-yellow-100" /> learning / review
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-muted" /> not yet
        </span>
      </div>

      <div className="grid gap-8">
        <section className="grid gap-3">
          <h2 className="text-lg font-medium">
            Characters <span className="text-sm font-normal text-muted-foreground">· {knownOf(active.chars)}/{active.chars.length} known</span>
          </h2>
          <Grid items={active.chars} />
        </section>

        <section className="grid gap-3">
          <h2 className="text-lg font-medium">
            Vocabulary <span className="text-sm font-normal text-muted-foreground">· {knownOf(active.words)}/{active.words.length} known</span>
          </h2>
          <Grid items={active.words} wide />
        </section>
      </div>
    </main>
  );
}
