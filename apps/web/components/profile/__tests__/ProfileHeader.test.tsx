import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileHeader } from '../ProfileHeader';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ShieldCheck: () => <svg data-testid="shield-check-icon" />,
  GraduationCap: () => <svg data-testid="graduation-cap-icon" />,
  CalendarDays: () => <svg data-testid="calendar-days-icon" />,
}));

describe('ProfileHeader card', () => {
  const baseProps = {
    name: 'Jamie Lee',
    email: 'jamie.lee@campusu.edu',
    university: 'Campus University',
    graduationYear: '2026',
    isVerified: false,
    memberSince: 'Sep 2025',
  };

  it('renders the user name', () => {
    render(<ProfileHeader {...baseProps} />);
    expect(screen.getByText('Jamie Lee')).toBeInTheDocument();
  });

  it('renders the university name', () => {
    render(<ProfileHeader {...baseProps} />);
    expect(screen.getByText(/Campus University/)).toBeInTheDocument();
  });

  it('renders the email address', () => {
    render(<ProfileHeader {...baseProps} />);
    expect(screen.getByText('jamie.lee@campusu.edu')).toBeInTheDocument();
  });

  it('renders the member since information', () => {
    render(<ProfileHeader {...baseProps} />);
    expect(screen.getByText(/Member since Sep 2025/)).toBeInTheDocument();
  });

  it('shows the "Verified Student" badge when isVerified is true', () => {
    render(<ProfileHeader {...baseProps} isVerified={true} />);
    expect(screen.getByText('Verified Student')).toBeInTheDocument();
  });

  it('does not show the "Verified Student" badge when isVerified is false', () => {
    render(<ProfileHeader {...baseProps} isVerified={false} />);
    expect(screen.queryByText('Verified Student')).not.toBeInTheDocument();
  });

  it('renders avatar fallback initials from the name', () => {
    render(<ProfileHeader {...baseProps} name="Alex Johnson" />);
    // Initials should be "AJ"
    expect(screen.getByText('AJ')).toBeInTheDocument();
  });

  it('renders single-initial fallback for a one-word name', () => {
    render(<ProfileHeader {...baseProps} name="Prince" />);
    expect(screen.getByText('P')).toBeInTheDocument();
  });
});
