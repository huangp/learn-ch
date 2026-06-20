'use client';

import { useState, useTransition } from 'react';
import { generateStoryAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function GenerateStoryForm({ learnerId }: { learnerId: number }) {
  const [theme, setTheme] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      try {
        await generateStoryAction(learnerId, theme);
      } catch (e) {
        // redirect() throws a control-flow signal we must not swallow.
        if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
        if (typeof e === 'object' && e && 'digest' in e && String((e as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) throw e;
        setError(e instanceof Error ? e.message : 'Generation failed');
      }
    });
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="theme">New story</Label>
      <div className="flex gap-2">
        <Input
          id="theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="Optional theme (e.g. adventure, mystery)"
        />
        <Button onClick={generate} disabled={pending} className="shrink-0">
          {pending ? 'Writing your story…' : 'Generate'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
