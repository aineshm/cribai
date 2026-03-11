import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Import AFTER mocks are in place
import ProfilePage from '../../../app/(main)/profile/page';

describe('ProfilePage tabs', () => {
  it('renders the "Saved Listings" tab trigger', () => {
    render(<ProfilePage />);
    expect(screen.getByRole('tab', { name: /saved listings/i })).toBeInTheDocument();
  });

  it('renders the "Account Settings" tab trigger', () => {
    render(<ProfilePage />);
    expect(screen.getByRole('tab', { name: /account settings/i })).toBeInTheDocument();
  });

  it('shows Saved Listings content by default (defaultValue="saved")', () => {
    render(<ProfilePage />);
    // SavedListings renders demo listing titles
    expect(screen.getByText('Cozy Studio near Campus')).toBeInTheDocument();
  });

  it('switches to Account Settings content when the settings tab is clicked', () => {
    render(<ProfilePage />);
    const settingsTab = screen.getByRole('tab', { name: /account settings/i });
    fireEvent.click(settingsTab);
    // AccountSettings renders "Personal Information" heading
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
  });

  it('hides Saved Listings content after switching to Account Settings', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('tab', { name: /account settings/i }));
    expect(screen.queryByText('Cozy Studio near Campus')).not.toBeInTheDocument();
  });
});
