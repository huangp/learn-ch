'use client';

import { useState } from 'react';
import { recordInteractionAction } from '@/app/actions';
import type { AnnotatedQuestion } from '@/components/reader-types';
import type { SelectedWord } from '@/components/CharPanel';
import { RevealableText } from '@/components/RevealableText';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Questions({
  storyId,
  learnerId,
  questions,
  showPinyin,
  onPick,
}: {
  storyId: number;
  learnerId: number;
  questions: AnnotatedQuestion[];
  showPinyin: boolean;
  onPick: (w: SelectedWord) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  function answer(qi: number, oi: number, q: AnnotatedQuestion) {
    if (answers[qi] !== undefined) return; // lock after first answer
    setAnswers((a) => ({ ...a, [qi]: oi }));
    const correct = oi === q.answer;
    const type = correct ? 'question_correct' : 'question_wrong';
    if (q.testsChars.length === 0) {
      void recordInteractionAction({ storyId, learnerId, type });
    } else {
      for (const char of q.testsChars) void recordInteractionAction({ storyId, learnerId, char, type });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Questions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        {questions.map((q, qi) => {
          const chosen = answers[qi];
          const answered = chosen !== undefined;
          return (
            <div key={qi} className="grid gap-2">
              {/* Prompt: tap any word to reveal pinyin/gloss (chrome reveal — no SRS signal). */}
              <div className="font-medium">
                <RevealableText segments={q.qSegments} showPinyin={showPinyin} onPick={onPick} charClassName="text-base" record={false} />
              </div>
              <div className="grid gap-2">
                {q.optionSegments.map((opt, oi) => {
                  const isAnswer = oi === q.answer;
                  const isChosen = oi === chosen;
                  return (
                    <div
                      key={oi}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-md border px-3 py-2',
                        answered && isAnswer && 'border-primary bg-primary/10',
                        answered && isChosen && !isAnswer && 'border-destructive bg-destructive/10',
                      )}
                    >
                      {/* Read the option (tap → reveal) separately from choosing it (the Select button). */}
                      <div className="min-w-0">
                        <RevealableText segments={opt} showPinyin={showPinyin} onPick={onPick} charClassName="text-lg" record={false} />
                      </div>
                      {answered ? (
                        <span className="shrink-0 text-lg">{isAnswer ? '✓' : isChosen ? '✗' : ''}</span>
                      ) : (
                        <Button size="sm" variant="outline" className="shrink-0" onClick={() => answer(qi, oi, q)}>
                          Select
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
