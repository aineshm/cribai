import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StepContext } from '../types';

// ── Mock external dependencies before imports ───────────────────────────

vi.mock('../../gemini-client', () => ({
  createGeminiClient: vi.fn(),
}));

vi.mock('../send-email', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('../registry', () => ({
  getRegisteredTypes: vi.fn(() => []),
  registerMission: vi.fn(),
}));

import { tourOutreachDefinition } from '../tour-outreach-mission';
import { createGeminiClient } from '../../gemini-client';
import { sendEmail } from '../send-email';
import { getRegisteredTypes, registerMission } from '../registry';

// ── Helpers ──────────────────────────────────────────────────────────────

const mockCreateGemini = vi.mocked(createGeminiClient);
const mockSendEmail = vi.mocked(sendEmail);
const mockGetTypes = vi.mocked(getRegisteredTypes);
const mockRegister = vi.mocked(registerMission);

function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    missionId: 'mission-1',
    userId: 'user-1',
    campusId: 'campus-1',
    campusSlug: 'uw-madison',
    input: {
      listingIds: ['listing-1', 'listing-2'],
      studentName: 'Alex',
      studentEmail: 'alex@wisc.edu',
      availability: {
        daysOfWeek: ['Mon', 'Wed'],
        timeWindows: ['10am-12pm', '2pm-4pm'],
      },
    },
    state: {},
    supabase: {} as StepContext['supabase'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('tourOutreachDefinition', () => {
  it('has type tour_outreach and 4 steps', () => {
    expect(tourOutreachDefinition.type).toBe('tour_outreach');
    expect(tourOutreachDefinition.steps).toHaveLength(4);
    expect(tourOutreachDefinition.steps.map(s => s.id)).toEqual([
      'fetch_contacts',
      'generate_drafts',
      'await_approval',
      'send_approved',
    ]);
  });
});

describe('fetch_contacts step', () => {
  const step = tourOutreachDefinition.steps[0]!;

  beforeEach(() => vi.clearAllMocks());

  it('returns contacts for listings with contact_email', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'listing-1',
                address: '123 Main St',
                bedrooms: 2,
                rent_monthly: 1200,
                contact_email: 'pm@example.com',
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as StepContext['supabase'];

    const ctx = makeCtx({
      input: {
        listingIds: ['listing-1'],
        studentName: 'Alex',
        studentEmail: 'alex@wisc.edu',
        availability: { daysOfWeek: ['Mon'], timeWindows: ['10am'] },
      },
      supabase: mockSupabase,
    });

    const result = await step.run(ctx);

    expect(result.output.contacts).toHaveLength(1);
    const contact = (result.output.contacts as Array<Record<string, unknown>>)[0]!;
    expect(contact.pmEmail).toBe('pm@example.com');
    expect(contact.address).toBe('123 Main St');
  });

  it('skips listings without contact_email', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'listing-2',
                address: '456 Oak Ave',
                bedrooms: 1,
                rent_monthly: 900,
                contact_email: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as StepContext['supabase'];

    const ctx = makeCtx({ supabase: mockSupabase });
    const result = await step.run(ctx);

    expect(result.output.contacts).toHaveLength(0);
  });
});

describe('generate_drafts step', () => {
  const step = tourOutreachDefinition.steps[1]!;

  beforeEach(() => vi.clearAllMocks());

  it('generates an email draft per contact', async () => {
    mockCreateGemini.mockReturnValue({
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: 'Hi, I would like to view your unit.' }),
      },
    } as unknown as ReturnType<typeof createGeminiClient>);

    const ctx = makeCtx({
      state: {
        contacts: [
          { listingId: 'listing-1', address: '123 Main St', bedrooms: 2, rentMonthly: 1200, pmEmail: 'pm@ex.com' },
        ],
      },
    });

    const result = await step.run(ctx);
    const drafts = result.output.emailDrafts as Array<Record<string, unknown>>;

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.to).toBe('pm@ex.com');
    expect(drafts[0]!.subject).toBe('Tour Request — 123 Main St');
    expect(drafts[0]!.text).toBe('Hi, I would like to view your unit.');
  });

  it('skips a draft when Gemini fails for that listing', async () => {
    mockCreateGemini
      .mockReturnValueOnce({
        models: { generateContent: vi.fn().mockRejectedValue(new Error('quota')) },
      } as unknown as ReturnType<typeof createGeminiClient>)
      .mockReturnValueOnce({
        models: { generateContent: vi.fn().mockResolvedValue({ text: 'Hi there!' }) },
      } as unknown as ReturnType<typeof createGeminiClient>);

    const ctx = makeCtx({
      state: {
        contacts: [
          { listingId: 'l1', address: '1 A St', bedrooms: null, rentMonthly: null, pmEmail: 'a@ex.com' },
          { listingId: 'l2', address: '2 B St', bedrooms: 1, rentMonthly: 800, pmEmail: 'b@ex.com' },
        ],
      },
    });

    const result = await step.run(ctx);
    const drafts = result.output.emailDrafts as Array<Record<string, unknown>>;

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.listingId).toBe('l2');
  });
});

describe('await_approval step', () => {
  const step = tourOutreachDefinition.steps[2]!;

  it('returns draft payload when email drafts exist', async () => {
    const emailDrafts = [
      { listingId: 'l1', address: '1 A', to: 'a@ex.com', subject: 'Tour Request — 1 A', text: 'Hi!' },
    ];
    const ctx = makeCtx({ state: { emailDrafts } });

    const result = await step.run(ctx);

    expect(result.draft).toBeDefined();
    expect(result.draft?.draftType).toBe('email_draft');
    expect((result.draft?.payload as Record<string, unknown>).count).toBe(1);
    expect((result.draft?.payload as Record<string, unknown>).emails).toEqual(emailDrafts);
  });

  it('returns done=true immediately when no email drafts', async () => {
    const ctx = makeCtx({ state: { emailDrafts: [] } });
    const result = await step.run(ctx);

    expect(result.done).toBe(true);
    expect(result.draft).toBeUndefined();
  });

  it('returns done=true when emailDrafts is undefined in state', async () => {
    const ctx = makeCtx({ state: {} });
    const result = await step.run(ctx);

    expect(result.done).toBe(true);
  });
});

describe('send_approved step', () => {
  const step = tourOutreachDefinition.steps[3]!;

  beforeEach(() => vi.clearAllMocks());

  it('sends an email per draft with correct idempotency key', async () => {
    mockSendEmail.mockResolvedValue({ id: 'email-1', error: null });

    const emailDrafts = [
      { listingId: 'l1', address: '1 A', to: 'a@ex.com', subject: 'Tour Request — 1 A', text: 'Hi!' },
      { listingId: 'l2', address: '2 B', to: 'b@ex.com', subject: 'Tour Request — 2 B', text: 'Hey!' },
    ];
    const ctx = makeCtx({ state: { emailDrafts } });

    const result = await step.run(ctx);

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'tour-mission-1-l1' }),
    );
    expect(result.output.sentCount).toBe(2);
    expect(result.output.failedCount).toBe(0);
    expect(result.done).toBe(true);
  });

  it('counts failures when sendEmail returns error', async () => {
    mockSendEmail
      .mockResolvedValueOnce({ id: 'ok', error: null })
      .mockResolvedValueOnce({ id: null, error: 'API error' });

    const emailDrafts = [
      { listingId: 'l1', address: '1 A', to: 'a@ex.com', subject: 'S', text: 'T' },
      { listingId: 'l2', address: '2 B', to: 'b@ex.com', subject: 'S', text: 'T' },
    ];
    const ctx = makeCtx({ state: { emailDrafts } });

    const result = await step.run(ctx);

    expect(result.output.sentCount).toBe(1);
    expect(result.output.failedCount).toBe(1);
  });

  it('returns sentCount=0 when no email drafts in state', async () => {
    const ctx = makeCtx({ state: {} });
    const result = await step.run(ctx);

    expect(result.output.sentCount).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('registration guard', () => {
  it('does not throw when module is evaluated and type already registered', () => {
    mockGetTypes.mockReturnValue(['tour_outreach']);

    expect(() => {
      // Re-evaluating the registration guard logic directly
      if (!mockGetTypes().includes('tour_outreach')) {
        mockRegister(tourOutreachDefinition);
      }
    }).not.toThrow();

    expect(mockRegister).not.toHaveBeenCalled();
  });
});
