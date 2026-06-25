'use client';

import { useState, useTransition } from 'react';
import { updateLearnerSettingsAction } from '@/app/actions';
import { PERSONAS, DEFAULT_PERSONA_ID } from '@/lib/persona/presets';
import { GENRES } from '@/lib/genres/presets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

// Adult-only post-onboarding editor for a learner's display name + default persona / genre.
// Mirrors OnboardForm's persona/genre pickers; '' genre = "surprise me" (no saved default).
export function SettingsForm({
  learnerId,
  displayName,
  personaId: initialPersonaId,
  genreId: initialGenreId,
}: {
  learnerId: number;
  displayName: string;
  personaId?: string;
  genreId?: string;
}) {
  const [name, setName] = useState(displayName);
  const [personaId, setPersonaId] = useState(initialPersonaId ?? DEFAULT_PERSONA_ID);
  const [genreId, setGenreId] = useState(initialGenreId ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMsg(null);
    startTransition(async () => {
      await updateLearnerSettingsAction(learnerId, { displayName: name, personaId, genreId });
      setMsg('Saved.');
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mei" />
      </div>

      <div className="grid gap-2">
        <Label>Reading companion</Label>
        <p className="text-sm text-muted-foreground">A friend who joins you across your stories.</p>
        <RadioGroup value={personaId} onValueChange={setPersonaId} className="gap-2">
          {PERSONAS.map((p) => (
            <label key={p.id} className="flex items-center gap-3 rounded-md border p-3 text-sm hover:bg-muted">
              <RadioGroupItem value={p.id} />
              <span className="text-2xl" aria-hidden>
                {p.emoji}
              </span>
              <span className="grid">
                <span className="font-medium text-foreground">
                  {p.name} <span className="text-muted-foreground">· {p.nameEn}</span>
                </span>
                <span className="text-muted-foreground">{p.blurb}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid gap-2">
        <Label>Favorite genre</Label>
        <p className="text-sm text-muted-foreground">We’ll lean toward this — you can change it for any story.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGenreId('')}
            aria-pressed={genreId === ''}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              genreId === '' ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            🎲 surprise me
          </button>
          {GENRES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGenreId(g.id)}
              aria-pressed={genreId === g.id}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                genreId === g.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <span aria-hidden>{g.emoji}</span> {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending} className="w-fit">
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
