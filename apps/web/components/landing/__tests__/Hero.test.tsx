import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from '../Hero';

describe('Hero', () => {
  it('renders "Get Started Free" CTA linking to /login when unauthenticated', () => {
    render(<Hero isAuthenticated={false} />);
    const cta = screen.getByRole('link', { name: 'Get Started Free' });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/login');
  });

  it('renders "Go to Dashboard" CTA linking to /explore when authenticated', () => {
    render(<Hero isAuthenticated={true} />);
    const cta = screen.getByRole('link', { name: 'Go to Dashboard' });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/explore');
  });

  it('defaults to unauthenticated CTA when isAuthenticated is not provided', () => {
    render(<Hero />);
    const cta = screen.getByRole('link', { name: 'Get Started Free' });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/login');
  });

  it('renders "See How It Works" link regardless of auth state', () => {
    render(<Hero isAuthenticated={true} />);
    const link = screen.getByRole('link', { name: 'See How It Works' });
    expect(link).toBeInTheDocument();
  });
});
