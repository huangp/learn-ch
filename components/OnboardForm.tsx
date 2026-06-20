'use client';

import { useState, useTransition } from 'react';
import { onboardLearnerAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

type Method = 'hsk' | 'paste' | 'zero';

export function OnboardForm() {
  const [name, setName] = useState('');
  const [method, setMethod] = useState<Method>('hsk');
  const [hsk, setHsk] = useState('3');
  const [paste, setPaste] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('name', name);
      fd.set('method', method);
      fd.set('hsk', hsk);
      fd.set('paste', paste);
      await onboardLearnerAction(fd);
    });
  }

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
