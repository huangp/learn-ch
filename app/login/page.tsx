import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/session';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const ctx = await getSessionContext();
  if (ctx) redirect('/');

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="mb-1 text-2xl font-semibold">Hanzi Graded Reader</h1>
      <p className="mb-8 text-sm text-muted-foreground">Sign in to keep reading.</p>
      <LoginForm />
    </main>
  );
}
