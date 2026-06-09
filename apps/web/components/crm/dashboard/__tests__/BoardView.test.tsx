import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BoardView } from '../BoardView';

describe('BoardView', () => {
  it('switches Pipeline → Compare', async () => {
    render(<BoardView />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /pipeline/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /compare/i }));
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  });

  it('renders the collaborative list header once loaded', async () => {
    render(<BoardView />);
    await waitFor(() => expect(screen.getByText(/Fall 2026 hunt/i)).toBeInTheDocument());
  });

  it('shows the add-by-URL input', async () => {
    render(<BoardView />);
    expect(screen.getByPlaceholderText(/paste a listing/i)).toBeInTheDocument();
  });

  it('renders pipeline stage groups by default once loaded', async () => {
    render(<BoardView />);
    await waitFor(() => expect(screen.getByRole('group', { name: /applied/i })).toBeInTheDocument());
  });
});
