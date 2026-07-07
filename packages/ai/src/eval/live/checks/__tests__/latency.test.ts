import { describe, expect, it } from 'vitest';
import { checkLatency, computeP95 } from '../latency';

const T0 = '2026-07-07T12:00:00.000Z';
function iso(msAfterT0: number): string {
  return new Date(new Date(T0).getTime() + msAfterT0).toISOString();
}

describe('computeP95', () => {
  it('returns null for an empty array', () => {
    expect(computeP95([])).toBeNull();
  });

  it('returns the single value for a 1-element array', () => {
    expect(computeP95([500])).toBe(500);
  });

  it('computes nearest-rank p95 over a sorted spread', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 100); // 100..2000
    // ceil(0.95*20)-1 = 18 (0-indexed) -> sorted[18] = 1900
    expect(computeP95(values)).toBe(1900);
  });
});

describe('checkLatency', () => {
  it('passes when both p95s are within budget', () => {
    const rows = [
      { requestId: 'r1', requestReceivedAt: T0, firstModelTokenAt: iso(1000), requestCompletedAt: iso(4000) },
      { requestId: 'r2', requestReceivedAt: T0, firstModelTokenAt: iso(1200), requestCompletedAt: iso(5000) },
    ];
    const result = checkLatency({ rows, totalBudgetMs: 12_000, ttftBudgetMs: 6_000 });
    expect(result.pass).toBe(true);
    expect(result.totalP95Ms).not.toBeNull();
    expect(result.throttled).toBe(false);
  });

  it('fails when total p95 exceeds budget', () => {
    const rows = [
      { requestId: 'r1', requestReceivedAt: T0, firstModelTokenAt: null, requestCompletedAt: iso(20_000) },
    ];
    const result = checkLatency({ rows, totalBudgetMs: 12_000, ttftBudgetMs: 6_000 });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/total p95/);
  });

  it('fails when TTFT p95 exceeds budget even if total is fine', () => {
    const rows = [
      { requestId: 'r1', requestReceivedAt: T0, firstModelTokenAt: iso(8_000), requestCompletedAt: iso(9_000) },
    ];
    const result = checkLatency({ rows, totalBudgetMs: 12_000, ttftBudgetMs: 6_000 });
    expect(result.pass).toBe(false);
  });

  it('handles rows with no firstModelTokenAt (deterministic short-circuit) — ttft p95 null, vacuous on that axis', () => {
    const rows = [
      { requestId: 'r1', requestReceivedAt: T0, firstModelTokenAt: null, requestCompletedAt: iso(2_000) },
    ];
    const result = checkLatency({ rows, totalBudgetMs: 12_000, ttftBudgetMs: 6_000 });
    expect(result.pass).toBe(true);
    expect(result.ttftP95Ms).toBeNull();
  });

  it('labels a throttled run distinctly without folding it into a latency failure', () => {
    const rows = [
      { requestId: 'r1', requestReceivedAt: T0, firstModelTokenAt: iso(500), requestCompletedAt: iso(2_000) },
    ];
    const result = checkLatency({
      rows,
      totalBudgetMs: 12_000,
      ttftBudgetMs: 6_000,
      throttledTurnCount: 1,
    });
    expect(result.throttled).toBe(true);
    expect(result.pass).toBe(true); // the successful turns were still within budget
    expect(result.detail).toMatch(/throttled/);
  });
});
