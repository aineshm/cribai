import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
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

  // AIN-95 follow-up: a rename saved from the drawer must reach the grid
  // card without a reload — the drawer's `onRenamed` propagates into
  // BoardView's own `units` state.
  describe('rename propagation (AIN-95 follow-up)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('propagates a saved rename to the grid card', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ listing: { id: 'crm_chapter_s1', nickname: 'The Regent gem' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);

      render(<BoardView />);

      fireEvent.click(await screen.findByRole('tab', { name: /grid/i }));
      const card = await screen.findByRole('button', { name: /chapter at madison/i });
      fireEvent.click(card);

      fireEvent.click(await screen.findByRole('button', { name: /rename/i }));
      const input = screen.getByRole('textbox', { name: /listing name/i });
      fireEvent.change(input, { target: { value: 'The Regent gem' } });
      fireEvent.click(screen.getByRole('button', { name: /save name/i }));

      await waitFor(() => {
        expect(screen.getByTestId('listing-display-name')).toHaveTextContent('The Regent gem');
      });

      // Close the drawer and confirm the grid card itself (not just the
      // drawer's local state) reflects the new name — no reload needed.
      fireEvent.click(screen.getByRole('button', { name: /close panel/i }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /the regent gem/i })).toBeInTheDocument();
      });
    });
  });
});
