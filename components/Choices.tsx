'use client';

import { useTransition } from 'react';
import { chooseBranchAction } from '@/app/actions';
import type { Choice } from '@/lib/generation/types';
import { Button } from '@/components/ui/button';

export function Choices({
  storyId,
  choices,
  flushDwell,
}: {
  storyId: number;
  choices: Choice[];
  flushDwell: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  function pick(choice: Choice) {
    startTransition(async () => {
      // Persist trailing dwell before branching — generating the next story grades this one, and
      // grading is idempotent, so late dwell writes would otherwise be dropped.
      await flushDwell();
      await chooseBranchAction(storyId, choice.seed, choice.label);
    });
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-muted-foreground">What happens next?</p>
      <div className="flex flex-wrap gap-2">
        {choices.map((c, i) => (
          <Button key={i} variant="outline" disabled={pending} onClick={() => pick(c)}>
            {pending ? 'Writing…' : c.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
