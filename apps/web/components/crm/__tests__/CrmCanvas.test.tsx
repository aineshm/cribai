import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CrmCanvas } from '../CrmCanvas';

describe('CrmCanvas', () => {
  it('defaults to List then switches to Rank', async () => {
    render(<CrmCanvas />);
    await waitFor(() => expect(screen.getByText(/Fall 2026 hunt/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /rank/i }));
    // Rank view shows scored rows (each carries a "Score" label).
    await waitFor(() => expect(screen.getAllByText(/score/i).length).toBeGreaterThan(0));
  });

  it('renders the three view tabs', async () => {
    render(<CrmCanvas />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /list/i })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /rank/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /compare/i })).toBeInTheDocument();
  });
});
