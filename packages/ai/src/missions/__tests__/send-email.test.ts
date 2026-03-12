import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Resend before importing send-email ─────────────────────────────

const mockSend = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

import { sendEmail } from '../send-email';

// ── Tests ───────────────────────────────────────────────────────────────

describe('sendEmail', () => {
  const baseParams = {
    to: 'pm@example.com',
    subject: 'Tour Request — 123 Main St',
    text: 'Hi, I would love to schedule a viewing.',
    idempotencyKey: 'tour-mission-1-listing-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', 'test-key');
  });

  it('returns { id, error: null } on success', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'email-abc123' }, error: null });

    const result = await sendEmail(baseParams);

    expect(result).toEqual({ id: 'email-abc123', error: null });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'pm@example.com',
        subject: 'Tour Request — 123 Main St',
        text: 'Hi, I would love to schedule a viewing.',
      }),
      expect.objectContaining({
        idempotencyKey: 'tour-mission-1-listing-1',
      }),
    );
  });

  it('returns { id: null, error: message } on Resend error — does not throw', async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    });

    const result = await sendEmail(baseParams);

    expect(result).toEqual({ id: null, error: 'Invalid API key' });
  });

  it('returns { id: null, error } when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const result = await sendEmail(baseParams);

    expect(result).toEqual({ id: null, error: 'RESEND_API_KEY not configured' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('uses default from-address when not specified', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'xyz' }, error: null });

    await sendEmail(baseParams);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'CampusNest Concierge <onboarding@resend.dev>',
      }),
      expect.any(Object),
    );
  });

  it('uses custom from-address when provided', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'xyz' }, error: null });

    await sendEmail({ ...baseParams, from: 'custom@campusnest.app' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'custom@campusnest.app' }),
      expect.any(Object),
    );
  });
});
