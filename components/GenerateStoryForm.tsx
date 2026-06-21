'use client';

import { useState, useTransition } from 'react';
import { generateStoryAction } from '@/app/actions';
import { GENRES } from '@/lib/genres/presets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function GenerateStoryForm({ learnerId }: { learnerId: number }) {
  const [theme, setTheme] = useState('');
  const [genreId, setGenreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pickGenre(id: string) {
    setGenreId((cur) => (cur === id ? null : id)); // toggle
    setTheme(''); // a genre and a custom theme are alternatives
  }

  function onThemeChange(value: string) {
    setTheme(value);
    if (value) setGenreId(null); // typing a custom theme clears the chip
  }

  function generate() {
    setError(null);
    startTransition(async () => {
      try {
        await generateStoryAction(learnerId, theme, genreId ?? undefined);
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
      <div className="flex flex-wrap gap-2">
        {GENRES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => pickGenre(g.id)}
            aria-pressed={genreId === g.id}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              genreId === g.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            <span aria-hidden>{g.emoji}</span> {g.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id="theme"
          value={theme}
          onChange={(e) => onThemeChange(e.target.value)}
          placeholder="…or type your own theme (e.g. a dragon who can't fly)"
        />
        <Button onClick={generate} disabled={pending} className="shrink-0">
          {pending ? 'Writing your story…' : 'Generate'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
