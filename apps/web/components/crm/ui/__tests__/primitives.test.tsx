import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BranchState } from '../BranchState';
import { StatusPill } from '../StatusPill';
import { isUrgent } from '../DeadlinePill';

describe('crm ui primitives', () => {
  it('BranchState renders ok via children', () => {
    render(<BranchState branch={{ status: 'ok', data: 42 }}>{(d) => <span>val {d}</span>}</BranchState>);
    expect(screen.getByText('val 42')).toBeInTheDocument();
  });
  it('BranchState renders the skipped reason, not a crash', () => {
    render(<BranchState branch={{ status: 'skipped', reason: 'no coordinates' }}>{() => <span>nope</span>}</BranchState>);
    expect(screen.getByText(/no coordinates/i)).toBeInTheDocument();
    expect(screen.queryByText('nope')).toBeNull();
  });
  it('BranchState renders the error message, never touching .data', () => {
    render(<BranchState branch={{ status: 'error', error: 'places API timed out' }}>{() => <span>nope</span>}</BranchState>);
    expect(screen.getByText(/places API timed out/i)).toBeInTheDocument();
    expect(screen.queryByText('nope')).toBeNull();
  });
  it('StatusPill shows the status label', () => {
    render(<StatusPill status="applied" />);
    expect(screen.getByText(/applied/i)).toBeInTheDocument();
  });
});

describe('isUrgent', () => {
  const NOW = Date.parse('2026-06-08T12:00:00Z');
  const iso = (deltaMs: number) => new Date(NOW + deltaMs).toISOString();
  const HOUR = 60 * 60 * 1000;

  it('is false when there is no deadline', () => {
    expect(isUrgent(null, NOW)).toBe(false);
  });
  it('is false for an unparseable date', () => {
    expect(isUrgent('not-a-date', NOW)).toBe(false);
  });
  it('is false for a deadline already in the past', () => {
    expect(isUrgent(iso(-HOUR), NOW)).toBe(false);
  });
  it('is true for a deadline within the 48h window', () => {
    expect(isUrgent(iso(2 * HOUR), NOW)).toBe(true);
  });
  it('is true exactly at the 48h boundary', () => {
    expect(isUrgent(iso(48 * HOUR), NOW)).toBe(true);
  });
  it('is false just beyond the 48h window', () => {
    expect(isUrgent(iso(48 * HOUR + 1), NOW)).toBe(false);
  });
});
