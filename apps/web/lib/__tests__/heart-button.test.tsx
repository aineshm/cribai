import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeartButton } from '../../components/heart-button';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Supabase client
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-123' } },
});

vi.mock('@campusnest/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'saved_listings') {
        return {
          insert: mockInsert,
          delete: () => ({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

describe('HeartButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders outline heart when not saved', () => {
    render(
      <HeartButton
        listingId="listing-1"
        initialSaved={false}
        campusSlug="uw-madison"
      />,
    );

    const button = screen.getByRole('button', { name: 'Save to favorites' });
    expect(button).toBeInTheDocument();

    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Unsaved overlay variant: stroke-white class applied via Tailwind
    expect(svg?.className).toContain('stroke-white');
    expect(svg?.className).not.toContain('fill-red-500');
  });

  it('renders filled heart when saved', () => {
    render(
      <HeartButton
        listingId="listing-1"
        initialSaved={true}
        campusSlug="uw-madison"
      />,
    );

    const button = screen.getByRole('button', {
      name: 'Remove from favorites',
    });
    expect(button).toBeInTheDocument();

    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Saved state: fill and stroke applied via Tailwind classes
    expect(svg?.className).toContain('fill-red-500');
    expect(svg?.className).toContain('stroke-red-500');
  });

  it('calls e.stopPropagation on click', () => {
    render(
      <HeartButton
        listingId="listing-1"
        initialSaved={false}
        campusSlug="uw-madison"
      />,
    );

    const button = screen.getByRole('button', { name: 'Save to favorites' });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    fireEvent(button, event);

    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('shows correct aria-label for unsaved state', () => {
    render(
      <HeartButton
        listingId="listing-1"
        initialSaved={false}
        campusSlug="uw-madison"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Save to favorites' }),
    ).toBeInTheDocument();
  });

  it('shows correct aria-label for saved state', () => {
    render(
      <HeartButton
        listingId="listing-2"
        initialSaved={true}
        campusSlug="uw-madison"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Remove from favorites' }),
    ).toBeInTheDocument();
  });
});
