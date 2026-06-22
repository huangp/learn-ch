'use client';

import { useState, useTransition } from 'react';
import { setChildCredentialsAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Adult control to set/reset a child's direct-login username + PIN.
export function ChildCredentialsForm({
  learnerId,
  currentUsername,
}: {
  learnerId: number;
  currentUsername: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(currentUsername ?? '');
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMsg(null);
    startTransition(async () => {
      const err = await setChildCredentialsAction(learnerId, username, pin);
      if (err) setMsg(err);
      else {
        setMsg('Saved.');
        setPin('');
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground underline">
        {currentUsername ? `Login: ${currentUsername} — change` : 'Set up reader login'}
      </button>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <p className="text-xs text-muted-foreground">A username + PIN this reader uses to sign in.</p>
      <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
      <Input
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        type="password"
        inputMode="numeric"
        placeholder="4–8 digit PIN"
      />
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
