'use client';

import { useState, useTransition } from 'react';
import { generateFromSeedAction } from '@/app/actions';
import { seedsBySource } from '@/lib/seeds/presets';
import type { StorySeed } from '@/lib/seeds/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Phase 8 (§17.2) — pick a plot skeleton; the engine retells it in the learner's vocabulary.
const SECTION_LABELS: Record<StorySeed['source'], string> = {
  authored: 'Adventures',
  history: 'From history',
  work: 'Classic tales',
};

export function SeedLibrary({ learnerId }: { learnerId: number }) {
  const groups = seedsBySource();
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start(seedId: string) {
    setError(null);
    setActiveId(seedId);
    startTransition(async () => {
      try {
        await generateFromSeedAction(learnerId, seedId);
      } catch (e) {
        // redirect() throws a control-flow signal we must not swallow.
        if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
        if (typeof e === 'object' && e && 'digest' in e && String((e as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) throw e;
        setError(e instanceof Error ? e.message : 'Generation failed');
        setActiveId(null);
      }
    });
  }

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-medium">Or pick an adventure</h2>
        <p className="text-sm text-muted-foreground">A known story, retold just for you.</p>
      </div>
      {(['authored', 'history', 'work'] as const).map((source) =>
        groups[source].length === 0 ? null : (
          <div key={source} className="grid gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{SECTION_LABELS[source]}</h3>
            <div className="grid gap-3">
              {groups[source].map((s) => (
                <Card key={s.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>
                        {s.title} <span className="text-muted-foreground">· {s.titleEn}</span>
                      </span>
                      <Button onClick={() => start(s.id)} disabled={pending} className="shrink-0">
                        {pending && activeId === s.id ? 'Writing…' : 'Read this'}
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
          </div>
        ),
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
