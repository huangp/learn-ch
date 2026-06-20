import Link from 'next/link';
import { OnboardForm } from '@/components/OnboardForm';
import { Button } from '@/components/ui/button';

export default function NewLearnerPage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New learner</h1>
        <Button variant="ghost" render={<Link href="/">Back</Link>} />
      </div>
      <OnboardForm />
    </main>
  );
}
