'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startSeedGenerationAction, markWordsKnownAction, loadMoreSlidesAction } from '@/app/actions';
import { seedsBySource } from '@/lib/seeds/presets';
import type { StorySeed } from '@/lib/seeds/types';
import { useGeneration } from '@/components/use-generation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StorySlideshow, type Slide } from '@/components/StorySlideshow';

// Phase 8 (§17.2) — pick a plot skeleton; the engine retells it in the learner's vocabulary.
const SECTION_LABELS: Record<StorySeed['source'], string> = {
  authored: 'Adventures',
  history: 'From history',
  work: 'Classic tales',
};

// Per-group page size — provisional, easily tuned. The pager only appears once a group exceeds it.
const SEEDS_PER_PAGE = 4;

export function SeedLibrary({ learnerId, slides }: { learnerId: number; slides: Slide[] }) {
  const groups = seedsBySource();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { status, run } = useGeneration();
  const [seedId, setSeedId] = useState<string | null>(null);
  const pending = open && status.kind === 'pending';

  function start(id: string) {
    setSeedId(id);
    setOpen(true);
    run(() => startSeedGenerationAction(learnerId, id));
  }

  async function persistKnown(knownWords: string[]) {
    if (knownWords.length > 0) await markWordsKnownAction(learnerId, knownWords);
  }

  async function handleStartReading(storyId: number, knownWords: string[]) {
    await persistKnown(knownWords);
    router.push(`/learners/${learnerId}/read/${storyId}`);
  }

  async function handleClose(knownWords: string[]) {
    await persistKnown(knownWords);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-medium">Or pick an adventure</h2>
        <p className="text-sm text-muted-foreground">A known story, retold just for you.</p>
      </div>
      {(['authored', 'history', 'work'] as const).map((source) =>
        groups[source].length === 0 ? null : (
          <SeedGroup key={source} label={SECTION_LABELS[source]} seeds={groups[source]} pending={pending} onPick={start} />
        ),
      )}
      {open && (
        <StorySlideshow
          slides={slides}
          status={status}
          onStartReading={handleStartReading}
          onClose={handleClose}
          onRetry={() => seedId && start(seedId)}
          loadMore={(exclude) => loadMoreSlidesAction(learnerId, exclude)}
        />
      )}
    </div>
  );
}

function SeedGroup({
  label,
  seeds,
  pending,
  onPick,
}: {
  label: string;
  seeds: StorySeed[];
  pending: boolean;
  onPick: (seedId: string) => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(seeds.length / SEEDS_PER_PAGE);
  const visible = seeds.slice(page * SEEDS_PER_PAGE, page * SEEDS_PER_PAGE + SEEDS_PER_PAGE);

  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <div className="grid gap-3">
        {visible.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>
                  {s.title} <span className="text-muted-foreground">· {s.titleEn}</span>
                </span>
                <Button onClick={() => onPick(s.id)} disabled={pending} className="shrink-0">
                  Read this
                </Button>
              </CardTitle>
              <CardDescription>{s.blurb}</CardDescription>
            </CardHeader>
            {s.attribution && (
              <CardContent className="text-xs text-muted-foreground">{s.attribution}</CardContent>
            )}
          </Card>
        ))}
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Previous page"
          >
            ‹ Prev
          </Button>
          <span>
            Page {page + 1} of {pageCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            Next ›
          </Button>
        </div>
      )}
    </div>
  );
}
