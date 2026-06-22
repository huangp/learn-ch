'use client';

import { useActionState } from 'react';
import { signInChild, signInWithGoogle } from '@/app/auth-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const [error, formAction, pending] = useActionState(signInChild, null);

  return (
    <div className="grid gap-8">
      {/* Adult / parent */}
      <form action={signInWithGoogle} className="grid gap-2">
        <p className="text-sm font-medium">Parent or teacher</p>
        <Button type="submit" variant="outline" className="w-full">
          Sign in with Google
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      {/* Child */}
      <form action={formAction} className="grid gap-3">
        <p className="text-sm font-medium">Reader login</p>
        <div className="grid gap-1.5">
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" autoComplete="username" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pin">PIN</Label>
          <Input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="off" required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Signing in…' : 'Start reading'}
        </Button>
      </form>
    </div>
  );
}
