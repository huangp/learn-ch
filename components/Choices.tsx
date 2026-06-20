'use client';

import { useTransition } from 'react';
import { chooseBranchAction } from '@/app/actions';
import type { Choice } from '@/lib/generation/types';
import { Button } from '@/components/ui/button';

export function Choices({ storyId, choices }: { storyId: number; choices: Choice[] }) {
  const [pending, startTransition] = useTransition();

  function pick(choice: Choice) {
    startTransition(async () => {
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
