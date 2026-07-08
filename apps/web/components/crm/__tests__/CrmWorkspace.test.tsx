import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CrmWorkspace } from '../CrmWorkspace';

/** Stub `window.matchMedia` so `useIsMobile` reports a fixed viewport class. */
function stubMatchMedia(matches: boolean): void {
  const mediaQueryList = {
    matches,
    media: '(max-width: 980px)',
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryList));
}

describe('CrmWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // AIN-104.1: canvas defaults OPEN on desktop widths.
  it('the canvas is open by default on desktop', async () => {
    render(<CrmWorkspace />);
    await waitFor(() => expect(screen.getByText(/Fall 2026 hunt/i)).toBeInTheDocument());
  });

  it('the toggle still closes and reopens the canvas', async () => {
    render(<CrmWorkspace />);
    await waitFor(() => expect(screen.getByText(/Fall 2026 hunt/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^my apartments$/i }));
    await waitFor(() => expect(screen.queryByText(/Fall 2026 hunt/i)).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /^my apartments$/i }));
    await waitFor(() => expect(screen.getByText(/Fall 2026 hunt/i)).toBeInTheDocument());
  });

  // AIN-104.1: the 60/40 split doesn't fit small viewports, so the canvas
  // defaults CLOSED on mobile — the toggle (via the mobile CanvasSheet) still
  // works both ways.
  it('the canvas defaults closed on mobile viewports', async () => {
    stubMatchMedia(true);
    render(<CrmWorkspace />);
    await waitFor(() => expect(screen.queryByText(/Fall 2026 hunt/i)).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /^my apartments$/i }));
    await waitFor(() => expect(screen.getByText(/Fall 2026 hunt/i)).toBeInTheDocument());
  });

  it('sending a URL in the composer surfaces a saved unit and its analysis', async () => {
    render(<CrmWorkspace />);
    const input = screen.getByPlaceholderText(/paste a listing/i);
    fireEvent.change(input, {
      target: { value: 'https://www.chapteratmadison.com/floor-plan/studio-s1/' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/Chapter at Madison/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/true cost/i)).toBeInTheDocument());
  });
});
