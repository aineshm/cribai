/**
 * Unit tests for crm/confidence.ts — pure math helpers (no I/O).
 */
import { describe, it, expect } from 'vitest';
import { confidenceToNumeric, inferenceConfidence } from '../confidence';

// ---------------------------------------------------------------------------
// confidenceToNumeric
// ---------------------------------------------------------------------------

describe('confidenceToNumeric', () => {
  it('maps "high" to 0.9', () => {
    expect(confidenceToNumeric('high')).toBe(0.9);
  });

  it('maps "medium" to 0.6', () => {
    expect(confidenceToNumeric('medium')).toBe(0.6);
  });

  it('maps "low" to 0.3', () => {
    expect(confidenceToNumeric('low')).toBe(0.3);
  });

  it('all outputs are in [0, 1]', () => {
    const levels = ['high', 'medium', 'low'] as const;
    for (const level of levels) {
      const v = confidenceToNumeric(level);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// inferenceConfidence
// ---------------------------------------------------------------------------

describe('inferenceConfidence', () => {
  it('returns 0 for savedCount = 0', () => {
    expect(inferenceConfidence(0)).toBe(0);
  });

  it('returns 0 for savedCount = 1', () => {
    expect(inferenceConfidence(1)).toBe(0);
  });

  it('returns a value in [0, 1] for all tested counts', () => {
    for (const n of [0, 1, 2, 3, 5, 7, 10, 20, 100]) {
      const v = inferenceConfidence(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is monotonically non-decreasing', () => {
    let prev = inferenceConfidence(0);
    for (let n = 1; n <= 15; n++) {
      const curr = inferenceConfidence(n);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('saturates at 1.0 for saves >= 10', () => {
    expect(inferenceConfidence(10)).toBe(1);
    expect(inferenceConfidence(20)).toBe(1);
    expect(inferenceConfidence(100)).toBe(1);
  });

  it('saves=5 yields >= 0.6 (sprint success criterion)', () => {
    expect(inferenceConfidence(5)).toBeGreaterThanOrEqual(0.6);
  });

  it('saves=3 produces a value in the expected range (~0.48)', () => {
    const v = inferenceConfidence(3);
    // log2(3) / log2(10) ≈ 0.477
    expect(v).toBeGreaterThan(0.4);
    expect(v).toBeLessThan(0.6);
  });

  it('saves=2 is > 0 (two saves gives a signal)', () => {
    expect(inferenceConfidence(2)).toBeGreaterThan(0);
  });
});
