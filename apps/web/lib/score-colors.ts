export interface ScoreColorVariants {
  readonly bg: string;
  readonly text: string;
  readonly border: string;
  readonly bgOnly: string;
}

export function getScoreColorVariants(score: number): ScoreColorVariants {
  if (score >= 7) return {
    bg: 'bg-[var(--fair-good-bg)]',
    text: 'text-[var(--fair-good)]',
    border: 'border-[var(--fair-good)]',
    bgOnly: 'bg-[var(--fair-good)]',
  };
  if (score >= 4) return {
    bg: 'bg-[var(--fair-ok-bg)]',
    text: 'text-[var(--fair-ok)]',
    border: 'border-[var(--fair-ok)]',
    bgOnly: 'bg-[var(--fair-ok)]',
  };
  return {
    bg: 'bg-[var(--fair-bad-bg)]',
    text: 'text-[var(--fair-bad)]',
    border: 'border-[var(--fair-bad)]',
    bgOnly: 'bg-[var(--fair-bad)]',
  };
}
