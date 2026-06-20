'use client';

import { useState } from 'react';
import { recordInteractionAction } from '@/app/actions';
import type { ComprehensionQuestion } from '@/lib/generation/types';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Questions({
  storyId,
  learnerId,
  questions,
}: {
  storyId: number;
  learnerId: number;
  questions: ComprehensionQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  function answer(qi: number, oi: number, q: ComprehensionQuestion) {
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
              <p className="font-medium">{q.q}</p>
              <div className="grid gap-2">
                {q.options.map((opt, oi) => {
                  const isAnswer = oi === q.answer;
                  const isChosen = oi === chosen;
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => answer(qi, oi, q)}
                      disabled={answered}
                      className={cn(
                        'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        !answered && 'hover:bg-muted',
                        answered && isAnswer && 'border-primary bg-primary/10',
                        answered && isChosen && !isAnswer && 'border-destructive bg-destructive/10',
                      )}
                    >
                      {opt}
                      {answered && isAnswer && ' ✓'}
                      {answered && isChosen && !isAnswer && ' ✗'}
                    </button>
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
