import { describe, it, expect } from 'vitest';
import { getFreshnessLevel, getFreshnessLabel } from '../components/freshness-badge';

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

describe('getFreshnessLevel', () => {
  it('returns "fresh" for 0 days ago (today)', () => {
    expect(getFreshnessLevel(daysAgo(0))).toBe('fresh');
  });

  it('returns "fresh" for 3 days ago (boundary)', () => {
    expect(getFreshnessLevel(daysAgo(3))).toBe('fresh');
  });

  it('returns "aging" for 4 days ago (boundary)', () => {
    expect(getFreshnessLevel(daysAgo(4))).toBe('aging');
  });

  it('returns "aging" for 6 days ago (boundary)', () => {
    expect(getFreshnessLevel(daysAgo(6))).toBe('aging');
  });

  it('returns "stale" for 7 days ago (boundary)', () => {
    expect(getFreshnessLevel(daysAgo(7))).toBe('stale');
  });

  it('returns "stale" for 30 days ago', () => {
    expect(getFreshnessLevel(daysAgo(30))).toBe('stale');
  });
});

describe('getFreshnessLabel', () => {
  it('returns "Verified today" for 0 days ago', () => {
    expect(getFreshnessLabel(daysAgo(0))).toBe('Verified today');
  });

  it('returns "Verified yesterday" for 1 day ago', () => {
    expect(getFreshnessLabel(daysAgo(1))).toBe('Verified yesterday');
  });

  it('returns "Verified 2 days ago" for 2 days ago', () => {
    expect(getFreshnessLabel(daysAgo(2))).toBe('Verified 2 days ago');
  });

  it('returns "Verified 5 days ago" for 5 days ago', () => {
    expect(getFreshnessLabel(daysAgo(5))).toBe('Verified 5 days ago');
  });

  it('returns "Possibly outdated" for 7 days ago', () => {
    expect(getFreshnessLabel(daysAgo(7))).toBe('Possibly outdated');
  });

  it('returns "Possibly outdated" for 8 days ago', () => {
    expect(getFreshnessLabel(daysAgo(8))).toBe('Possibly outdated');
  });
});
