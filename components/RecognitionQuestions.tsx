'use client';

import { useState } from 'react';
import { recordInteractionAction } from '@/app/actions';
import type { RecognitionItem } from '@/lib/generation/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Part = 'pinyin' | 'meaning';

/** Text with every occurrence of `char` highlighted. Plain text — no pinyin/tap-reveal (it'd give the answer away). */
function Highlight({ text, char }: { text: string; char: string }) {
  return (
    <>
      {[...text].map((c, i) =>
        c === char ? (
          <span key={i} className="font-semibold text-primary">
            {c}
          </span>
        ) : (
          c
        ),
      )}
    </>
  );
}

export function RecognitionQuestions({
  storyId,
  learnerId,
  items,
  valueOffset,
}: {
  storyId: number;
  learnerId: number;
  items: RecognitionItem[];
  /** Interaction `value` base: comprehension questions use 0..n-1, these use n + index. */
  valueOffset: number;
}) {
  const [picks, setPicks] = useState<Record<number, Partial<Record<Part, number>>>>({});

  function pick(ii: number, part: Part, oi: number, item: RecognitionItem) {
    const cur = picks[ii] ?? {};
    if (cur[part] !== undefined) return; // lock after first pick
    const next = { ...cur, [part]: oi };
    setPicks((p) => ({ ...p, [ii]: next }));
    if (next.pinyin === undefined || next.meaning === undefined) return;
    // Record only once both parts are picked, so a half-done item doesn't count as answered
    // (screentime credit dedupes by value). Any wrong pick → weak signal for the char in FSRS.
    const value = valueOffset + ii;
    for (const [chosen, answer] of [
      [next.pinyin, item.pinyinAnswer],
      [next.meaning, item.meaningAnswer],
    ]) {
      const type = chosen === answer ? 'question_correct' : 'question_wrong';
      void recordInteractionAction({ storyId, learnerId, char: item.char, type, value });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Characters — 组词造句</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-8">
        {items.map((item, ii) => {
          const p = picks[ii] ?? {};
          const done = p.pinyin !== undefined && p.meaning !== undefined;
          return (
            <div key={ii} className="grid gap-3">
              <div className="flex items-center gap-4">
                <span className="text-5xl">{item.char}</span>
                <div className="grid gap-1 text-lg">
                  <div>
                    <span className="mr-2 text-sm text-muted-foreground">组词</span>
                    <Highlight text={item.word} char={item.char} />
                  </div>
                  <div>
                    <span className="mr-2 text-sm text-muted-foreground">造句</span>
                    <Highlight text={item.sentence} char={item.char} />
                  </div>
                </div>
              </div>
              {(
                [
                  ['pinyin', '读音 Pronunciation', item.pinyinOptions, item.pinyinAnswer],
                  ['meaning', '意思 Meaning', item.meaningOptions, item.meaningAnswer],
                ] as const
              ).map(([part, label, options, answer]) => {
                const chosen = p[part];
                const answered = chosen !== undefined;
                return (
                  <div key={part} className="grid gap-2">
                    <div className="text-sm font-medium text-muted-foreground">{label}</div>
                    <div className={cn('grid gap-2', part === 'pinyin' && 'grid-cols-2 sm:grid-cols-4')}>
                      {options.map((opt, oi) => {
                        const isAnswer = oi === answer;
                        const isChosen = oi === chosen;
                        return (
                          <Button
                            key={oi}
                            variant="outline"
                            disabled={answered}
                            onClick={() => pick(ii, part, oi, item)}
                            className={cn(
                              'h-auto justify-between whitespace-normal py-2 text-left disabled:opacity-100',
                              part === 'pinyin' ? 'text-lg' : 'text-sm',
                              answered && isAnswer && 'border-primary bg-primary/10',
                              answered && isChosen && !isAnswer && 'border-destructive bg-destructive/10',
                            )}
                          >
                            <span>{opt}</span>
                            {answered && <span className="shrink-0">{isAnswer ? '✓' : isChosen ? '✗' : ''}</span>}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {done && (
                <div className="text-sm text-muted-foreground">
                  {item.char} = <span className="font-medium text-foreground">{item.pinyinOptions[item.pinyinAnswer]}</span> ·{' '}
                  {item.meaningOptions[item.meaningAnswer]}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
