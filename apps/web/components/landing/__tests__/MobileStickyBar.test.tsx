import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileStickyBar } from '../MobileStickyBar';

// Mock IntersectionObserver (not available in jsdom)
beforeAll(() => {
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

describe('MobileStickyBar', () => {
  it('renders "Get Started Free" CTA linking to /login when unauthenticated', () => {
    render(<MobileStickyBar isAuthenticated={false} visible />);
    const cta = screen.getByRole('link', { name: 'Get Started Free' });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/login');
  });

  it('renders "Go to Dashboard" CTA linking to /explore when authenticated', () => {
    render(<MobileStickyBar isAuthenticated={true} visible />);
    const cta = screen.getByRole('link', { name: 'Go to Dashboard' });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/explore');
  });

  it('defaults to unauthenticated CTA when isAuthenticated is not provided', () => {
    render(<MobileStickyBar visible />);
    const cta = screen.getByRole('link', { name: 'Get Started Free' });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/login');
  });
});
