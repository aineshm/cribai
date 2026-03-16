import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ProfilePage is an async Server Component (Supabase + cookies) — test the client shell instead
import { ProfilePageClient } from '../ProfilePageClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock framer-motion to avoid animation issues
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children?: React.ReactNode;
      variants?: unknown;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Heart: () => <svg data-testid="heart-icon" />,
  Settings: () => <svg data-testid="settings-icon" />,
  ShieldCheck: () => <svg />,
  CheckCircle2: () => <svg />,
  GraduationCap: () => <svg />,
  CalendarDays: () => <svg />,
  MapPin: () => <svg />,
  DollarSign: () => <svg />,
  User: () => <svg />,
  Bell: () => <svg />,
  LogOut: () => <svg />,
  Save: () => <svg />,
  Sofa: () => <svg />,
  Car: () => <svg />,
  MessageSquare: () => <svg />,
  Sparkles: () => <svg />,
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const defaultProps = {
  name: 'Test Student',
  email: 'test@wisc.edu',
  university: 'University of Wisconsin-Madison',
  graduationYear: '2026',
  memberSince: 'Jan 2024',
  isVerified: true,
};

const demoListings = [
  { id: '1', title: 'Cozy Studio near Campus', address: '123 College Ave', price: 950 },
  { id: '2', title: 'Spacious 2BR Apartment', address: '456 University Blvd', price: 1400 },
];

describe('ProfilePage tabs', () => {
  it('renders the "Saved Listings" tab trigger', () => {
    render(<ProfilePageClient {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /saved listings/i })).toBeInTheDocument();
  });

  it('renders the "Account Settings" tab trigger', () => {
    render(<ProfilePageClient {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /account settings/i })).toBeInTheDocument();
  });

  it('shows Saved Listings content by default when listings are provided', () => {
    render(<ProfilePageClient {...defaultProps} savedListings={demoListings} />);
    expect(screen.getByText('Cozy Studio near Campus')).toBeInTheDocument();
  });

  it('switches to Account Settings content when the settings tab is clicked', () => {
    render(<ProfilePageClient {...defaultProps} />);
    const settingsTab = screen.getByRole('tab', { name: /account settings/i });
    fireEvent.click(settingsTab);
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
  });

  it('hides Saved Listings content after switching to Account Settings', () => {
    render(<ProfilePageClient {...defaultProps} savedListings={demoListings} />);
    fireEvent.click(screen.getByRole('tab', { name: /account settings/i }));
    expect(screen.queryByText('Cozy Studio near Campus')).not.toBeInTheDocument();
  });
});
