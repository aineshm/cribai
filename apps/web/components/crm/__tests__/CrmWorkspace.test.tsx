import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CrmWorkspace } from '../CrmWorkspace';

describe('CrmWorkspace', () => {
  it('opens the canvas on toggle', async () => {
    render(<CrmWorkspace />);
    expect(screen.queryByText(/Fall 2026 hunt/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /my apartments/i }));
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
