import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileBottomNav } from '../MobileBottomNav';

let mockPathname = '/explore';
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

describe('MobileBottomNav', () => {
  beforeEach(() => {
    mockPathname = '/explore';
    mockSearchParams = new URLSearchParams();
  });

  it('renders for unauthenticated users with login links for protected tabs', () => {
    render(<MobileBottomNav isAuthenticated={false} />);
    // Search tab still links to /explore
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/explore');
    // Agent tab links to /login for guests
    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute('href', '/login');
    // Profile tab links to /login for guests
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/login');
  });

  it('does not render on the landing page', () => {
    mockPathname = '/';
    const { container } = render(<MobileBottomNav isAuthenticated={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not render on login page', () => {
    mockPathname = '/login';
    const { container } = render(<MobileBottomNav isAuthenticated={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks only the saved tab as current when the saved profile tab is open', () => {
    mockPathname = '/profile';
    mockSearchParams = new URLSearchParams('tab=saved');

    render(<MobileBottomNav isAuthenticated />);

    expect(screen.getByRole('link', { name: 'Saved' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current');
  });

  it('marks only the profile tab as current on the default profile page', () => {
    mockPathname = '/profile';

    render(<MobileBottomNav isAuthenticated />);

    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Saved' })).not.toHaveAttribute('aria-current');
  });
});
