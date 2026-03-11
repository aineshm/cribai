import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock ConciergeShell to render a testable wrapper
vi.mock('@/components/concierge/ConciergeShell', () => ({
  ConciergeShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="concierge-shell">{children}</div>
  ),
}));

// Mock ConciergeNavButton to render a testable button
vi.mock('@/components/concierge/ConciergeNavButton', () => ({
  ConciergeNavButton: () => (
    <button data-testid="concierge-nav-button" type="button">
      Concierge
    </button>
  ),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// Import AFTER mocks are registered
const { default: MainLayout } = await import('@/app/(main)/layout');

describe('MainLayout', () => {
  it('renders ConciergeShell wrapper', () => {
    render(<MainLayout>test content</MainLayout>);
    expect(screen.getByTestId('concierge-shell')).toBeInTheDocument();
  });

  it('renders ConciergeNavButton inside the nav', () => {
    render(<MainLayout>test content</MainLayout>);
    const navButton = screen.getByTestId('concierge-nav-button');
    expect(navButton).toBeInTheDocument();
    // Verify it is inside a nav element
    const nav = navButton.closest('nav');
    expect(nav).not.toBeNull();
  });

  it('renders children passed to it', () => {
    render(<MainLayout>unique-child-content</MainLayout>);
    expect(screen.getByText('unique-child-content')).toBeInTheDocument();
  });
});
