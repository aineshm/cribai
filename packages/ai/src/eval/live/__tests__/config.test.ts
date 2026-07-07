/**
 * AIN-93 — target-guard tests. The live harness must refuse to run without
 * an explicit, unambiguous target — missing/ambiguous env is a hard error,
 * never a silent default.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveTargetConfig,
  resolveLiveCostCeilingUsd,
  resolveCampusSlug,
} from '../config';

describe('resolveTargetConfig', () => {
  it('refuses when AIN93_TARGET_BASE_URL is missing', () => {
    expect(() => resolveTargetConfig({ AIN93_CONFIRM_TARGET: 'prod' })).toThrow(
      /AIN93_TARGET_BASE_URL is required/,
    );
  });

  it('refuses when AIN93_CONFIRM_TARGET is missing', () => {
    expect(() =>
      resolveTargetConfig({ AIN93_TARGET_BASE_URL: 'https://cribai.app' }),
    ).toThrow(/AIN93_CONFIRM_TARGET must be exactly/);
  });

  it('refuses an ambiguous AIN93_CONFIRM_TARGET value', () => {
    expect(() =>
      resolveTargetConfig({
        AIN93_TARGET_BASE_URL: 'https://cribai.app',
        AIN93_CONFIRM_TARGET: 'staging',
      }),
    ).toThrow(/must be exactly 'prod' or 'local'/);
  });

  it('accepts an explicit prod confirmation', () => {
    expect(
      resolveTargetConfig({
        AIN93_TARGET_BASE_URL: 'https://cribai.app',
        AIN93_CONFIRM_TARGET: 'prod',
      }),
    ).toEqual({ baseUrl: 'https://cribai.app', target: 'prod' });
  });

  it('accepts an explicit local confirmation', () => {
    expect(
      resolveTargetConfig({
        AIN93_TARGET_BASE_URL: 'http://localhost:3000',
        AIN93_CONFIRM_TARGET: 'local',
      }),
    ).toEqual({ baseUrl: 'http://localhost:3000', target: 'local' });
  });

  it('trims whitespace on both values', () => {
    expect(
      resolveTargetConfig({
        AIN93_TARGET_BASE_URL: '  https://cribai.app  ',
        AIN93_CONFIRM_TARGET: '  prod  ',
      }),
    ).toEqual({ baseUrl: 'https://cribai.app', target: 'prod' });
  });
});

describe('resolveLiveCostCeilingUsd', () => {
  it('defaults to $5.00', () => {
    expect(resolveLiveCostCeilingUsd({})).toBe(5.0);
  });

  it('reads a positive override', () => {
    expect(resolveLiveCostCeilingUsd({ CRIBAI_EVAL_COST_CEILING_USD: '2.50' })).toBe(2.5);
  });

  it('falls back to the default on garbage input', () => {
    expect(resolveLiveCostCeilingUsd({ CRIBAI_EVAL_COST_CEILING_USD: 'nope' })).toBe(5.0);
    expect(resolveLiveCostCeilingUsd({ CRIBAI_EVAL_COST_CEILING_USD: '-1' })).toBe(5.0);
  });
});

describe('resolveCampusSlug', () => {
  it('defaults to uw-madison', () => {
    expect(resolveCampusSlug({})).toBe('uw-madison');
  });

  it('reads an override', () => {
    expect(resolveCampusSlug({ AIN93_CAMPUS_SLUG: 'uw-milwaukee' })).toBe('uw-milwaukee');
  });
});
