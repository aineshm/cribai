/**
 * Small, pure CRM display formatters shared across the Phase 2a cards
 * (SavedUnitCard, RankCompareTable). Extracted to keep the cards DRY — no
 * behavior change from the per-file copies they replaced.
 */

/** `1495 → "$1,495"`, `null → "—"`. Null-safe superset of the per-card copies. */
export const money = (n: number | null): string => (n != null ? `$${n.toLocaleString()}` : '—');

/** `0 → "Studio"`, `2 → "2 bed"`, `null → "—"`. */
export const bedLabel = (b: number | null): string => {
  if (b == null) return '—';
  return b === 0 ? 'Studio' : `${b} bed`;
};
