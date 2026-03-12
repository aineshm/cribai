import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostWizard } from '../PostWizard';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; variants?: unknown; initial?: unknown; animate?: unknown; exit?: unknown; custom?: unknown }) => <div {...props}>{children}</div>,
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronLeft: () => <svg data-testid="chevron-left" />,
  ChevronRight: () => <svg data-testid="chevron-right" />,
  MapPin: () => <svg />,
  DollarSign: () => <svg />,
  Calendar: () => <svg />,
  Home: () => <svg />,
  Check: () => <svg data-testid="check-icon" />,
  Minus: () => <svg />,
  Plus: () => <svg />,
  Ruler: () => <svg />,
  Layers: () => <svg />,
  Sofa: () => <svg />,
  Car: () => <svg />,
  WashingMachine: () => <svg />,
  UtensilsCrossed: () => <svg />,
  Snowflake: () => <svg />,
  Fence: () => <svg />,
  Dumbbell: () => <svg />,
  Waves: () => <svg />,
  PawPrint: () => <svg />,
  Zap: () => <svg />,
  BookOpen: () => <svg />,
  Archive: () => <svg />,
  Upload: () => <svg />,
  X: () => <svg />,
  ImageIcon: () => <svg />,
  Sparkles: () => <svg />,
  Send: () => <svg />,
  BedDouble: () => <svg />,
  Bath: () => <svg />,
  GraduationCap: () => <svg />,
  CalendarDays: () => <svg />,
  ShieldCheck: () => <svg />,
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PostWizard multi-step navigation', () => {
  it('renders the Basics step heading on initial load', () => {
    render(<PostWizard />);
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
  });

  it('all 6 step labels are visible in the sidebar', () => {
    render(<PostWizard />);
    const stepLabels = ['Basics', 'Details', 'Amenities', 'Photos', 'Description', 'Review'];
    stepLabels.forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
  });

  it('Back button is disabled on the first step', () => {
    render(<PostWizard />);
    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton).toBeDisabled();
  });

  it('Next button advances from Basics to Details', () => {
    render(<PostWizard />);
    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);
    expect(screen.getByText('Property Details')).toBeInTheDocument();
  });

  it('Back button returns from Details to Basics', () => {
    render(<PostWizard />);
    // Advance to step 2
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Property Details')).toBeInTheDocument();
    // Go back
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
  });

  it('navigates forward through all 6 steps in order', () => {
    render(<PostWizard />);

    // Step 0: Basics — heading is "Basic Information" (unique)
    expect(screen.getByText('Basic Information')).toBeInTheDocument();

    // Step 1: Details — heading is "Property Details" (unique)
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Property Details')).toBeInTheDocument();

    // Step 2: Amenities — heading "Amenities" also appears in sidebar;
    // confirm the h2 step-content heading is present via its tag role
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const amenitiesHeadings = screen.getAllByText('Amenities');
    expect(amenitiesHeadings.length).toBeGreaterThanOrEqual(1);
    // Specifically the h2 step heading should be in the set
    const amenitiesH2 = amenitiesHeadings.find((el) => el.tagName === 'H2');
    expect(amenitiesH2).toBeTruthy();

    // Step 3: Photos — "Photos" also appears in sidebar; same approach
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const photosHeadings = screen.getAllByText('Photos');
    const photosH2 = photosHeadings.find((el) => el.tagName === 'H2');
    expect(photosH2).toBeTruthy();

    // Step 4: Description — "Description" also appears in sidebar
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const descHeadings = screen.getAllByText('Description');
    const descH2 = descHeadings.find((el) => el.tagName === 'H2');
    expect(descH2).toBeTruthy();

    // Step 5: Review — heading is "Review Your Listing" (unique)
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Review Your Listing')).toBeInTheDocument();
  });

  it('Next button is not rendered on the final Review step', () => {
    render(<PostWizard />);
    // Navigate to last step (index 5)
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
    }
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });
});
