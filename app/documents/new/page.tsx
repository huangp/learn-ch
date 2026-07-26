import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSessionContext } from '@/lib/auth/session';
import { listAccessibleLearners } from '@/lib/auth/access';
import { DocumentUploadForm } from '@/components/DocumentUploadForm';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function NewDocumentPage() {
  const ctx = await getSessionContext();
  if (ctx?.kind !== 'adult') redirect('/'); // parents only

  const learners = listAccessibleLearners(db, ctx).map((l) => ({ id: l.id, displayName: l.displayName }));

  return (
    <main className="mx-auto max-w-xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Upload a document</h1>
        <Button variant="ghost" render={<Link href="/">Back</Link>} />
      </div>
      {learners.length === 0 ? (
        <p className="text-muted-foreground">
          Create a reader first, then you can share documents with them.
        </p>
      ) : (
        <DocumentUploadForm learners={learners} />
      )}
    </main>
  );
}
