'use client';

import { useMemo, useState, useTransition } from 'react';
import { onboardLearnerAction } from '@/app/actions';
import type { FreqRankedChar } from '@/lib/placement/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

type Method = 'hsk' | 'paste' | 'grid' | 'zero';

const PAGE_SIZE = 100;

export function OnboardForm({ gridChars }: { gridChars: FreqRankedChar[] }) {
  const [name, setName] = useState('');
  const [method, setMethod] = useState<Method>('hsk');
  const [hsk, setHsk] = useState('3');
  const [paste, setPaste] = useState('');
  const [pending, startTransition] = useTransition();

  // Toggle-grid state (§16.1 path 3): a bulk "know down to here" cutoff plus fine per-char
  // overrides. `cutoffMode` switches a tile click between setting the cutoff and fine-toggling.
  const [cutoffRank, setCutoffRank] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [cutoffMode, setCutoffMode] = useState(false);
  const [page, setPage] = useState(0);

  const baseKnown = (c: FreqRankedChar) => cutoffRank != null && c.freqRank <= cutoffRank;
  const effectiveKnown = (c: FreqRankedChar) => (c.char in overrides ? overrides[c.char] : baseKnown(c));

  const knownCount = useMemo(
    () => gridChars.reduce((n, c) => n + (effectiveKnown(c) ? 1 : 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gridChars, cutoffRank, overrides],
  );

  function clickTile(c: FreqRankedChar) {
    if (cutoffMode) {
      setCutoffRank(c.freqRank);
    } else {
      setOverrides((o) => ({ ...o, [c.char]: !effectiveKnown(c) }));
    }
  }

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('name', name);
      fd.set('method', method);
      fd.set('hsk', hsk);
      fd.set('paste', paste);

      if (method === 'grid') {
        // Derive the exact ToggleGridInput shape: cutoff ∪ known − unknown.
        const known: string[] = [];
        const unknown: string[] = [];
        for (const c of gridChars) {
          const base = baseKnown(c);
          const eff = effectiveKnown(c);
          if (eff && !base) known.push(c.char);
          else if (!eff && base) unknown.push(c.char);
        }
        fd.set('cutoffFreqRank', cutoffRank != null ? String(cutoffRank) : '');
        fd.set('gridKnown', JSON.stringify(known));
        fd.set('gridUnknown', JSON.stringify(unknown));
      }

      await onboardLearnerAction(fd);
    });
  }

  const pageCount = Math.ceil(gridChars.length / PAGE_SIZE);
  const pageChars = gridChars.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mei" />
      </div>

      <div className="grid gap-2">
        <Label>Placement</Label>
        <RadioGroup value={method} onValueChange={(v) => setMethod(v as Method)} className="gap-3">
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="hsk" /> Declare an HSK level
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="paste" /> Paste characters I know
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="grid" /> Pick from a character grid
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="zero" /> Start from zero (bootstrap)
          </label>
        </RadioGroup>
      </div>

      {method === 'hsk' && (
        <div className="grid gap-2">
          <Label>HSK level</Label>
          <RadioGroup value={hsk} onValueChange={setHsk} className="flex flex-row gap-4">
            {['1', '2', '3', '4', '5', '6'].map((n) => (
              <label key={n} className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value={n} /> {n}
              </label>
            ))}
          </RadioGroup>
        </div>
      )}

      {method === 'paste' && (
        <div className="grid gap-2">
          <Label htmlFor="paste">Known characters / text</Label>
          <Textarea
            id="paste"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste a vocab list or a passage — we keep the characters you already know."
            rows={5}
          />
        </div>
      )}

      {method === 'grid' && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Characters by frequency (most common first). Tap the ones you know.{' '}
              <span className="font-medium text-foreground">{knownCount} known</span>
            </p>
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <Switch checked={cutoffMode} onCheckedChange={setCutoffMode} />
              <span>Mark down to here</span>
            </label>
          </div>
          {cutoffMode && (
            <p className="text-xs text-muted-foreground">
              Tap a character to mark it and everything more common as known
              {cutoffRank != null ? ` (currently: top ${cutoffRank})` : ''}.
            </p>
          )}
          <div className="grid grid-cols-10 gap-1">
            {pageChars.map((c) => (
              <button
                key={c.char}
                type="button"
                onClick={() => clickTile(c)}
                aria-pressed={effectiveKnown(c)}
                className={
                  'flex h-9 items-center justify-center rounded text-lg transition-colors ' +
                  (effectiveKnown(c)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70')
                }
              >
                {c.char}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} / {pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {method === 'zero' && (
        <p className="text-sm text-muted-foreground">
          We&apos;ll start you at the beginning of the curriculum with extra scaffolding (pinyin shown by default).
        </p>
      )}

      <Button onClick={submit} disabled={pending} className="w-fit">
        {pending ? 'Creating…' : 'Create learner'}
      </Button>
    </div>
  );
}
