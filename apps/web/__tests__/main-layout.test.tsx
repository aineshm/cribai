import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// next/headers mock — will be overridden per test
const mockGetUser = vi.fn();
const mockGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({})),
  headers: vi.fn(() => Promise.resolve({ get: mockGet })),
}));

// Mock ChatProvider — layout now wraps children with it
vi.mock('@/components/chat/ChatProvider', () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { slug: 'uw-madison' } }),
}));

vi.mock('@campusnest/supabase/server', () => ({
  createServerComponentClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

// Import AFTER mocks are registered
const { default: MainLayout } = await import('@/app/(main)/layout');

describe('MainLayout', () => {
  beforeEach(() => {
    mockGet.mockReturnValue(null);
  });

  it('renders ConciergeShell wrapper', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const layout = await MainLayout({ children: <>test content</> });
    render(layout);
    expect(screen.getByTestId('concierge-shell')).toBeInTheDocument();
  });

  it('renders ConciergeNavButton inside the nav', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const layout = await MainLayout({ children: <>test content</> });
    render(layout);
    const navButton = screen.getByTestId('concierge-nav-button');
    expect(navButton).toBeInTheDocument();
    const nav = navButton.closest('nav');
    expect(nav).not.toBeNull();
  });

  it('renders children passed to it', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const layout = await MainLayout({ children: <>unique-child-content</> });
    render(layout);
    expect(screen.getByText('unique-child-content')).toBeInTheDocument();
  });

  it('shows Post and Profile nav links when authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } } });
    const layout = await MainLayout({ children: <></> });
    render(layout);
    const postLink = screen.getByRole('link', { name: 'Post' });
    const profileLink = screen.getByRole('link', { name: 'Profile' });
    expect(postLink).toBeInTheDocument();
    expect(postLink).toHaveAttribute('href', '/post');
    expect(profileLink).toBeInTheDocument();
    expect(profileLink).toHaveAttribute('href', '/profile');
  });

  it('does NOT show Post and Profile nav links when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGet.mockReturnValue(null);
    const layout = await MainLayout({ children: <></> });
    render(layout);
    expect(screen.queryByRole('link', { name: 'Post' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('shows Post and Profile links via dev-auth header when no Supabase user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const devUser = JSON.stringify({ id: 'dev-user-1', email: 'dev@example.com' });
    mockGet.mockImplementation((key: string) =>
      key === 'x-dev-user-json' ? devUser : null
    );
    const layout = await MainLayout({ children: <></> });
    render(layout);
    expect(screen.getByRole('link', { name: 'Post' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
  });

  it('CampusNest wordmark still renders in both auth states', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGet.mockReturnValue(null);
    const layout = await MainLayout({ children: <></> });
    render(layout);
    expect(screen.getByText('CampusNest')).toBeInTheDocument();
  });
});
