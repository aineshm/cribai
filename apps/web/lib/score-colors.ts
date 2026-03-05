export interface ScoreColorVariants {
  readonly bg: string;
  readonly text: string;
  readonly border: string;
}

export function getScoreColorVariants(score: number): ScoreColorVariants {
  if (score >= 7) return { bg: 'var(--fair-good-bg)', text: 'var(--fair-good)', border: 'var(--fair-good)' };
  if (score >= 4) return { bg: 'var(--fair-ok-bg)', text: 'var(--fair-ok)', border: 'var(--fair-ok)' };
  return { bg: 'var(--fair-bad-bg)', text: 'var(--fair-bad)', border: 'var(--fair-bad)' };
}
