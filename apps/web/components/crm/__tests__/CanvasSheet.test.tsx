import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CanvasSheet } from '../CanvasSheet';

describe('CanvasSheet', () => {
  it('renders nothing queryable when closed', () => {
    render(<CanvasSheet open={false} onClose={() => {}} />);
    expect(screen.queryByText(/Fall 2026 hunt/i)).toBeNull();
  });

  it('shows the canvas content as a sheet when open', async () => {
    render(<CanvasSheet open={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Fall 2026 hunt/i)).toBeInTheDocument());
  });

  it('exposes a close affordance when open', () => {
    render(<CanvasSheet open={true} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });
});
