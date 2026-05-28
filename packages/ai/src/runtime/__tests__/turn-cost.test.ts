/**
 * PDR-004 Track A Days 5-6 (AIN-9) — turn-cost projection tests.
 *
 * Table-driven over the Vertex pricing ($0.15/M in, $0.60/M out, cached
 * $0.01875/M). Covers the cached discount, the $0.05 cap boundary, zero usage,
 * and the env-overridable cap.
 */

import { describe, expect, it } from 'vitest';
import {
  projectTurnCost,
  isOverCap,
  resolveTurnCostCapUsd,
  TURN_COST_CAP_USD_DEFAULT,
} from '../turn-cost';

const IN = 0.15 / 1_000_000;
const OUT = 0.6 / 1_000_000;
const CACHED = 0.01875 / 1_000_000;

describe('projectTurnCost', () => {
  it('zero usage projects $0', () => {
    const cost = projectTurnCost({ inputTokens: 0, outputTokens: 0 });
    expect(cost.costUsd).toBe(0);
    expect(cost.nonCachedInputTokens).toBe(0);
    expect(cost.cachedTokens).toBe(0);
  });

  it('input + output, no cache', () => {
    const cost = projectTurnCost({ inputTokens: 1000, outputTokens: 500 });
    expect(cost.nonCachedInputTokens).toBe(1000);
    expect(cost.costUsd).toBeCloseTo(1000 * IN + 500 * OUT, 12);
  });

  it('applies the cached discount to the cached portion of input', () => {
    // 4000 input of which 3000 cached → 1000 non-cached + 3000 cached.
    const cost = projectTurnCost({ inputTokens: 4000, outputTokens: 800, cachedTokens: 3000 });
    expect(cost.cachedTokens).toBe(3000);
    expect(cost.nonCachedInputTokens).toBe(1000);
    expect(cost.costUsd).toBeCloseTo(1000 * IN + 3000 * CACHED + 800 * OUT, 12);
  });

  it('clamps cachedTokens to total input', () => {
    const cost = projectTurnCost({ inputTokens: 1000, outputTokens: 0, cachedTokens: 5000 });
    expect(cost.cachedTokens).toBe(1000);
    expect(cost.nonCachedInputTokens).toBe(0);
    expect(cost.costUsd).toBeCloseTo(1000 * CACHED, 12);
  });

  it('treats undefined / negative usage fields as zero', () => {
    const cost = projectTurnCost({
      inputTokens: -10 as never,
      outputTokens: undefined as never,
      cachedTokens: -5 as never,
    });
    expect(cost.costUsd).toBe(0);
  });
});

describe('isOverCap — $0.05 boundary', () => {
  it('is false exactly AT the cap', () => {
    expect(isOverCap(0.05, 0.05)).toBe(false);
  });

  it('is true just OVER the cap', () => {
    expect(isOverCap(0.0500001, 0.05)).toBe(true);
  });

  it('is false under the cap', () => {
    expect(isOverCap(0.049, 0.05)).toBe(false);
  });

  it('a realistic large turn that breaches the cap is flagged', () => {
    // 100k input + 60k output ≈ $0.051 > $0.05.
    const cost = projectTurnCost({ inputTokens: 100_000, outputTokens: 60_000 });
    expect(cost.costUsd).toBeGreaterThan(0.05);
    expect(isOverCap(cost.costUsd, TURN_COST_CAP_USD_DEFAULT)).toBe(true);
  });
});

describe('resolveTurnCostCapUsd — env override', () => {
  it('defaults to $0.05 when unset', () => {
    expect(resolveTurnCostCapUsd({})).toBe(0.05);
  });

  it('uses a valid positive override', () => {
    expect(resolveTurnCostCapUsd({ CRIBAI_TURN_COST_CAP_USD: '0.10' })).toBe(0.1);
  });

  it('ignores a malformed / non-positive override', () => {
    expect(resolveTurnCostCapUsd({ CRIBAI_TURN_COST_CAP_USD: 'abc' })).toBe(0.05);
    expect(resolveTurnCostCapUsd({ CRIBAI_TURN_COST_CAP_USD: '-1' })).toBe(0.05);
    expect(resolveTurnCostCapUsd({ CRIBAI_TURN_COST_CAP_USD: '0' })).toBe(0.05);
  });
});
