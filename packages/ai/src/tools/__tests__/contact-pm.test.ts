import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contactPm } from '../handlers/contact-pm';
import { createMockContext, createMockQueryBuilder } from './helpers';

vi.mock('../../gemini-client', () => ({
  createGeminiClient: vi.fn(),
}));

import { createGeminiClient } from '../../gemini-client';

const mockCreateGeminiClient = vi.mocked(createGeminiClient);

const SAMPLE_LISTING_WITH_LANDLORD = {
  address: '123 Langdon St',
  rent_monthly: 1200,
  bedrooms: 2,
  bathrooms: 1,
  landlord_id: 'landlord-1111-1111-1111-111111111111',
  contact_email: 'listing@example.com',
};

const SAMPLE_LANDLORD = {
  name: 'John Smith',
  company: 'Madison Property Group',
  phone: '608-555-1234',
  email: 'john@madisonpg.com',
};

function setupGeminiMock(draft = 'Hey! I saw your listing at 123 Langdon St and I am interested in the 2-bed apartment for $1200/mo.') {
  const mockGenerate = vi.fn().mockResolvedValue({ text: draft });
  mockCreateGeminiClient.mockReturnValue({
    models: { generateContent: mockGenerate },
  } as unknown as ReturnType<typeof createGeminiClient>);
  return mockGenerate;
}

describe('contactPm', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-gemini-key' };
  });

  it('returns landlord contact card + Gemini draft when landlord exists', async () => {
    const context = createMockContext();
    const listingBuilder = createMockQueryBuilder(SAMPLE_LISTING_WITH_LANDLORD);
    const landlordBuilder = createMockQueryBuilder(SAMPLE_LANDLORD);

    const fromMock = context.supabase.from as ReturnType<typeof vi.fn>;
    fromMock
      .mockReturnValueOnce(listingBuilder)
      .mockReturnValueOnce(landlordBuilder);

    setupGeminiMock();

    const result = await contactPm(
      { listing_id: '11111111-1111-1111-1111-111111111111' },
      context,
    );

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('John Smith');
      expect(result.clientBlock.content).toContain('Madison Property Group');
      expect(result.clientBlock.content).toContain('608-555-1234');
      expect(result.clientBlock.content).toContain('john@madisonpg.com');
      expect(result.clientBlock.content).toContain('Draft message');
    }
    expect(result.modelContext).toContain('John Smith');
  });

  it('falls back to listing contact_email when landlord_id is NULL', async () => {
    const context = createMockContext();
    const listingBuilder = createMockQueryBuilder({
      ...SAMPLE_LISTING_WITH_LANDLORD,
      landlord_id: null,
    });

    const fromMock = context.supabase.from as ReturnType<typeof vi.fn>;
    fromMock.mockReturnValueOnce(listingBuilder);

    setupGeminiMock();

    const result = await contactPm(
      { listing_id: '11111111-1111-1111-1111-111111111111' },
      context,
    );

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('listing@example.com');
      expect(result.clientBlock.content).toContain('limited');
    }
  });

  it('appends user message to draft when provided', async () => {
    const context = createMockContext();
    const listingBuilder = createMockQueryBuilder(SAMPLE_LISTING_WITH_LANDLORD);
    const landlordBuilder = createMockQueryBuilder(SAMPLE_LANDLORD);

    const fromMock = context.supabase.from as ReturnType<typeof vi.fn>;
    fromMock
      .mockReturnValueOnce(listingBuilder)
      .mockReturnValueOnce(landlordBuilder);

    const mockGenerate = setupGeminiMock();

    await contactPm(
      {
        listing_id: '11111111-1111-1111-1111-111111111111',
        message: 'Is this still available?',
      },
      context,
    );

    // The user's message should be passed to Gemini prompt
    const callArgs = mockGenerate.mock.calls[0]?.[0] as { contents: string };
    expect(callArgs.contents).toContain('Is this still available?');
  });

  it('returns contact info without draft when Gemini unavailable', async () => {
    const context = createMockContext();
    const listingBuilder = createMockQueryBuilder(SAMPLE_LISTING_WITH_LANDLORD);
    const landlordBuilder = createMockQueryBuilder(SAMPLE_LANDLORD);

    const fromMock = context.supabase.from as ReturnType<typeof vi.fn>;
    fromMock
      .mockReturnValueOnce(listingBuilder)
      .mockReturnValueOnce(landlordBuilder);

    delete process.env.GEMINI_API_KEY;
    // Also ensure createGeminiClient throws when called without key
    mockCreateGeminiClient.mockImplementation(() => {
      throw new Error('Gemini not configured');
    });

    const result = await contactPm(
      { listing_id: '11111111-1111-1111-1111-111111111111' },
      context,
    );

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('John Smith');
      expect(result.clientBlock.content).toContain('Draft generation unavailable');
    }
  });

  it('throws when listing not found', async () => {
    const context = createMockContext();
    const builder = createMockQueryBuilder(null, { message: 'not found' });
    (context.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

    await expect(
      contactPm({ listing_id: '11111111-1111-1111-1111-111111111111' }, context),
    ).rejects.toThrow();
  });

  it('rejects missing listing_id', async () => {
    const context = createMockContext();
    await expect(contactPm({}, context)).rejects.toThrow();
  });

  it('rejects invalid listing_id', async () => {
    const context = createMockContext();
    await expect(
      contactPm({ listing_id: 'bad-id' }, context),
    ).rejects.toThrow();
  });

  it('rejects message over 500 chars', async () => {
    const context = createMockContext();
    await expect(
      contactPm(
        {
          listing_id: '11111111-1111-1111-1111-111111111111',
          message: 'a'.repeat(501),
        },
        context,
      ),
    ).rejects.toThrow();
  });
});
