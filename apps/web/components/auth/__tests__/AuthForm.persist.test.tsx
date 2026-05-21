import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthForm } from '../AuthForm';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
let mockReturnToParam: string | null = null;
let mockProfileRecord:
  | { display_name?: string | null; profile_completed_at?: string | null }
  | null = null;

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

// Mock fetch for /api/auth/validate-email (server-side email validation).
// Post PDR-003 Track B Day 2 the response shape is `{ valid, isEdu, badge? }`.
const mockFetch = vi.fn().mockResolvedValue({
  json: async () => ({ valid: true, isEdu: true, badge: 'verified_student' }),
});
vi.stubGlobal('fetch', mockFetch);

// Supabase client mock — includes updateUser + getUser + from for profile persistence
const mockUpdateUser = vi.fn().mockResolvedValue({ error: null });
const mockVerifyOtp = vi.fn().mockResolvedValue({ error: null });
const mockSignInWithOtp = vi.fn().mockResolvedValue({ error: null });
const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-1', email: 'student@wisc.edu' } },
});
const mockProfileMaybeSingle = vi.fn(async () => ({
  data: mockProfileRecord,
  error: null,
}));
const mockProfileUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});

vi.mock('@campusnest/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
      updateUser: mockUpdateUser,
      getUser: mockGetUser,
    },
    from: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: mockProfileMaybeSingle,
        }),
      }),
      update: mockProfileUpdate,
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

describe('AuthForm — profile persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturnToParam = null;
    mockProfileRecord = null;
    mockUpdateUser.mockResolvedValue({ error: null });
  });

  it('calls updateUser with correct metadata field names', async () => {
    await advanceToProfileStep();
    fireEvent.click(screen.getByTestId('complete-profile-btn'));
    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({
        data: {
          full_name: 'Test',
          university: 'UW-Madison',
          graduation_year: '2026',
        },
      });
    });
  });

  it('writes is_verified_student=true into user_metadata for .edu emails after OTP verify', async () => {
    await advanceToProfileStep();
    // The badge updateUser fires before the profile step is reached, so by the
    // time we land on the profile button it must already have been called.
    expect(mockUpdateUser).toHaveBeenCalledWith({
      data: { is_verified_student: true },
    });
  });

  it('navigates to /explore after successful updateUser', async () => {
    await advanceToProfileStep();
    fireEvent.click(screen.getByTestId('complete-profile-btn'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/explore');
    });
  });

  it('shows error and does not navigate when profile updateUser fails', async () => {
    // First call is the .edu badge write (success); second call is the profile
    // update from handleProfileComplete (the one whose failure we care about).
    mockUpdateUser.mockResolvedValueOnce({ error: null });
    mockUpdateUser.mockResolvedValueOnce({ error: { message: 'Update failed' } });
    await advanceToProfileStep();
    fireEvent.click(screen.getByTestId('complete-profile-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('auth-error')).toBeInTheDocument();
      expect(screen.getByTestId('auth-error').textContent).toContain('Update failed');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('calls profile updateUser before router.push (no race condition)', async () => {
    const callOrder: string[] = [];
    // Two updateUser calls happen: badge (during OTP verify) + profile (on
    // complete-profile click). Only the profile one should precede push.
    mockUpdateUser.mockImplementationOnce(async () => {
      callOrder.push('badgeUpdate');
      return { error: null };
    });
    mockUpdateUser.mockImplementationOnce(async () => {
      callOrder.push('profileUpdate');
      return { error: null };
    });
    mockPush.mockImplementationOnce(() => { callOrder.push('push'); });

    await advanceToProfileStep();
    fireEvent.click(screen.getByTestId('complete-profile-btn'));

    await waitFor(() => {
      expect(callOrder).toEqual(['badgeUpdate', 'profileUpdate', 'push']);
    });
  });
});
