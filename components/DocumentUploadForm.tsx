'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { parseDocumentAction, assignDocumentAction, type DocumentPreview } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface LearnerOption {
  id: number;
  displayName: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Three-segment readability bar: known (acquired) · learning (in progress) · new. */
function CoverageBar({ known, learning, newPct }: { known: number; learning: number; newPct: number }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      <div style={{ width: pct(known) }} className="bg-emerald-500" />
      <div style={{ width: pct(learning) }} className="bg-amber-400" />
      <div style={{ width: pct(newPct) }} className="bg-muted-foreground/25" />
    </div>
  );
}

export function DocumentUploadForm({ learners }: { learners: LearnerOption[] }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(learners.map((l) => l.id)));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ count: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function parse() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      if (file) fd.set('file', file);
      if (paste.trim()) fd.set('text', paste);
      fd.set('title', title);
      const res = await parseDocumentAction(fd);
      if (res.error) {
        setError(res.error);
        setPreview(null);
        return;
      }
      if (!title) setTitle(res.title);
      setPreview(res);
    });
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = selected.size === learners.length;

  function assign() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const res = await assignDocumentAction([...selected], title, preview.text);
      if ('error' in res) setError(res.error);
      else setDone(res);
    });
  }

  function reset() {
    setPreview(null);
    setDone(null);
    setError(null);
    setFile(null);
    setPaste('');
  }

  // ---- Success ----
  if (done) {
    return (
      <div className="grid gap-4">
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          Shared “{title}” with {done.count} {done.count === 1 ? 'reader' : 'readers'}. It’s now in their story list.
        </p>
        <div className="flex gap-2">
          <Button render={<Link href="/">Back to readers</Link>} />
          <Button variant="outline" onClick={reset}>
            Upload another
          </Button>
        </div>
      </div>
    );
  }

  const noHan = preview != null && preview.uniqueHanCount === 0;

  return (
    <div className="grid gap-6">
      {/* Step 1 — pick a source */}
      <div className="grid gap-2">
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Chapter 1"
          aria-required="true"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="file">Document</Label>
        <input
          id="file"
          type="file"
          accept=".txt,.pdf,.docx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
          }}
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/70"
        />
        <p className="text-xs text-muted-foreground">Plain text (.txt), PDF (.pdf) or Word (.docx).</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="paste">…or paste text</Label>
        <Textarea
          id="paste"
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setPreview(null);
          }}
          placeholder="Paste a passage in Chinese."
          rows={4}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!preview && (
        <Button onClick={parse} disabled={pending || (!file && paste.trim() === '')} className="w-fit">
          {pending ? 'Reading…' : 'Preview'}
        </Button>
      )}

      {/* Step 2 — preview + assign */}
      {preview && (
        <div className="grid gap-5 border-t pt-6">
          <div className="grid gap-1">
            <h2 className="text-lg font-medium">Preview</h2>
            <p className="text-sm text-muted-foreground">
              {preview.totalChars.toLocaleString()} characters · {preview.uniqueHanCount.toLocaleString()} distinct Chinese
              characters
            </p>
          </div>

          {preview.warning && <p className="text-sm text-amber-600 dark:text-amber-500">{preview.warning}</p>}

          {!noHan && (
            <>
              <div className="grid gap-2">
                <Label>How much each reader can read</Label>
                <p className="text-xs text-muted-foreground">
                  <span className="text-emerald-600 dark:text-emerald-400">known</span> ·{' '}
                  <span className="text-amber-600 dark:text-amber-500">learning</span> · <span>new</span>
                </p>
                <ul className="grid gap-3">
                  {preview.coverage.map((c) => (
                    <li key={c.learnerId}>
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selected.has(c.learnerId)}
                          onChange={() => toggle(c.learnerId)}
                          className="size-4"
                        />
                        <span className="grid flex-1 gap-1">
                          <span className="flex items-center justify-between text-sm">
                            <span className="font-medium">{c.displayName}</span>
                            <span className="text-muted-foreground">
                              {pct(c.knownPct)} known · {pct(c.learningPct)} learning · {pct(c.newPct)} new
                            </span>
                          </span>
                          <CoverageBar known={c.knownPct} learning={c.learningPct} newPct={c.newPct} />
                          <span className="text-xs text-muted-foreground">
                            {c.targets.length > 0 ? `teaches ${c.targets.length} new: ${c.targets.join(' ')}` : 'no new targets'}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              {learners.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelected(allSelected ? new Set() : new Set(learners.map((l) => l.id)))}
                  className="w-fit text-sm text-muted-foreground underline hover:text-foreground"
                >
                  {allSelected ? 'Clear all' : 'Select all readers'}
                </button>
              )}

              {title.trim() === '' && <p className="text-sm text-muted-foreground">Add a title above to share.</p>}
              <div className="flex gap-2">
                <Button onClick={assign} disabled={pending || selected.size === 0 || title.trim() === ''} className="w-fit">
                  {pending
                    ? 'Sharing…'
                    : `Share with ${selected.size} ${selected.size === 1 ? 'reader' : 'readers'}`}
                </Button>
                <Button variant="ghost" onClick={reset} disabled={pending}>
                  Start over
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
