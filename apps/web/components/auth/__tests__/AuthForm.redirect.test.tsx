import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthForm } from '../AuthForm';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
let mockReturnToParam: string | null = null;

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'returnTo' ? mockReturnToParam : null),
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock framer-motion — render children as plain divs
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Mail: () => <svg data-testid="mail-icon" />,
  ArrowLeft: () => <svg data-testid="arrow-left-icon" />,
}));

// Mock OTPInput and ProfileSetup to simplify testing
vi.mock('../OTPInput', () => ({
  OTPInput: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input
      data-testid="otp-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('../ProfileSetup', () => ({
  ProfileSetup: ({
    onComplete,
  }: {
    email: string;
    onComplete: (profile: { firstName: string; university: string; graduationYear: string }) => void;
    loading: boolean;
  }) => (
    <button
      data-testid="complete-profile-btn"
      type="button"
      onClick={() =>
        onComplete({
          firstName: 'Test',
          university: 'UW-Madison',
          graduationYear: '2026',
        })
      }
    >
      Complete Profile
    </button>
  ),
}));

// Supabase client mock — OTP sign-in and verify succeed, includes getUser + from for profile persistence
const mockVerifyOtp = vi.fn().mockResolvedValue({ error: null });
const mockSignInWithOtp = vi.fn().mockResolvedValue({ error: null });

vi.mock('@campusnest/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'student@wisc.edu' } },
      }),
    },
    from: () => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function advanceToProfileStep() {
  // Render the form — it starts on the email step
  render(<AuthForm />);

  // Fill in the email and submit
  const emailInput = screen.getByRole('textbox', { name: /email/i });
  fireEvent.change(emailInput, { target: { value: 'student@wisc.edu' } });

  const continueBtn = screen.getByRole('button', { name: /continue/i });
  fireEvent.click(continueBtn);

  // Wait for OTP step to appear
  await waitFor(() => {
    expect(screen.getByTestId('otp-input')).toBeInTheDocument();
  });

  // Simulate entering a full 8-digit OTP — triggers auto-verify
  const otpInput = screen.getByTestId('otp-input');
  fireEvent.change(otpInput, { target: { value: '12345678' } });

  // Wait for profile step to appear
  await waitFor(() => {
    expect(screen.getByTestId('complete-profile-btn')).toBeInTheDocument();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthForm — post-auth redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturnToParam = null;
  });

  it('redirects to /explore when no returnTo param is present', async () => {
    mockReturnToParam = null;

    await advanceToProfileStep();

    const completeBtn = screen.getByTestId('complete-profile-btn');
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/explore');
    });
  });

  it('redirects to returnTo path when valid relative path is provided', async () => {
    mockReturnToParam = '/profile';

    await advanceToProfileStep();

    const completeBtn = screen.getByTestId('complete-profile-btn');
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/profile');
    });
  });

  it('redirects to /explore when returnTo is an open redirect attempt (//evil.com)', async () => {
    mockReturnToParam = '//evil.com';

    await advanceToProfileStep();

    const completeBtn = screen.getByTestId('complete-profile-btn');
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/explore');
    });
  });
});
