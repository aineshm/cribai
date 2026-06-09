import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock ConciergeShell to render a testable wrapper
vi.mock('@/components/concierge/ConciergeShell', () => ({
  ConciergeShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="concierge-shell">{children}</div>
  ),
}));

// ConciergeNavButton was removed — nav now uses a plain Chat link

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

// Mock MainLayoutClient — bridges ConciergeContext into ChatProvider.
// In unit tests we stub this to avoid the useConcierge() dependency.
vi.mock('@/components/layout/MainLayoutClient', () => ({
  MainLayoutClient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { slug: 'uw-madison', id: 'campus-1', campus_id: 'campus-1' } }),
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

  it('renders Chat nav link inside the nav when authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const layout = await MainLayout({ children: <>test content</> });
    render(layout);
    const chatLink = screen.getByRole('link', { name: /agent/i });
    expect(chatLink).toBeInTheDocument();
    expect(chatLink).toHaveAttribute('href', '/messages');
    const nav = chatLink.closest('nav');
    expect(nav).not.toBeNull();
  });

  it('renders a My Apartments nav link when authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const layout = await MainLayout({ children: <></> });
    render(layout);
    const link = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/my-apartments');
    expect(link).toBeDefined();
  });

  it('renders children passed to it', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const layout = await MainLayout({ children: <>unique-child-content</> });
    render(layout);
    expect(screen.getByText('unique-child-content')).toBeInTheDocument();
  });

  it('shows Chat and Profile nav links when authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } } });
    const layout = await MainLayout({ children: <></> });
    render(layout);
    const chatLink = screen.getByRole('link', { name: 'Chat' });
    const profileLink = screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/profile');
    expect(chatLink).toBeInTheDocument();
    expect(chatLink).toHaveAttribute('href', '/chat');
    expect(profileLink).toBeInTheDocument();
    expect(profileLink).toHaveAttribute('href', '/profile');
  });

  it('does NOT show Chat and Profile nav links when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGet.mockReturnValue(null);
    const layout = await MainLayout({ children: <></> });
    render(layout);
    expect(screen.queryByRole('link', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/profile')).toBeUndefined();
  });

  it('shows Chat and Profile links via dev-auth header when no Supabase user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const devUser = JSON.stringify({ id: 'dev-user-1', email: 'dev@example.com' });
    mockGet.mockImplementation((key: string) =>
      key === 'x-dev-user-json' ? devUser : null
    );
    const layout = await MainLayout({ children: <></> });
    render(layout);
    expect(screen.getByRole('link', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/profile')).toBeDefined();
  });

  it('CribAI wordmark still renders in both auth states', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGet.mockReturnValue(null);
    const layout = await MainLayout({ children: <></> });
    render(layout);
    expect(screen.getByText('CribAI')).toBeInTheDocument();
  });
});
