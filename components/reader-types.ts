import type { AnnotatedSegment } from '@/lib/annotate/index';
import type { Choice, ComprehensionQuestion } from '@/lib/generation/types';

// View-models for the reader: the persisted questions/choices (plain hanzi) augmented at render time
// with annotated segments (pinyin/gloss) so their text gets the same tap-to-reveal as the story body.
// Built in app/learners/[id]/read/[storyId]/page.tsx via annotate(); no schema/persistence change.

export interface AnnotatedQuestion extends ComprehensionQuestion {
  qSegments: AnnotatedSegment[];
  optionSegments: AnnotatedSegment[][];
}

export interface AnnotatedChoice extends Choice {
  labelSegments: AnnotatedSegment[];
}
