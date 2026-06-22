'use server';

import { AuthError } from 'next-auth';
import { signIn, signOut } from '@/auth';

// Auth entry points used by the login page and the sign-out control.

export async function signInWithGoogle(): Promise<void> {
  await signIn('google', { redirectTo: '/' }); // throws NEXT_REDIRECT on success
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}

/** Child username + PIN sign-in. Returns an error string on failure; redirects on success. */
export async function signInChild(_prev: string | null, formData: FormData): Promise<string | null> {
  const username = String(formData.get('username') ?? '');
  const pin = String(formData.get('pin') ?? '');
  try {
    await signIn('child', { username, pin, redirectTo: '/' });
    return null;
  } catch (e) {
    if (e instanceof AuthError) return 'Wrong username or PIN.';
    throw e; // NEXT_REDIRECT and others must propagate
  }
}
