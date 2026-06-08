import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BranchState } from '../BranchState';
import { StatusPill } from '../StatusPill';

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
  it('StatusPill shows the status label', () => {
    render(<StatusPill status="applied" />);
    expect(screen.getByText(/applied/i)).toBeInTheDocument();
  });
});
