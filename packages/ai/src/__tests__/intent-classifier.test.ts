/**
 * Unit tests for intent-classifier.ts
 * Mocks createGeminiClient so no real Gemini API calls are made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyIntent, shouldClassify } from '../intent-classifier';

// ---------------------------------------------------------------------------
// Mock Gemini client
// ---------------------------------------------------------------------------

vi.mock('../gemini-client', () => ({
  createGeminiClient: vi.fn(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          intent: 'housing_search',
          confidence: 0.95,
          extracted_fields: { bedrooms: 2, max_rent: 1500 },
        }),
      }),
    },
  })),
}));

// ---------------------------------------------------------------------------
// shouldClassify
// ---------------------------------------------------------------------------

describe('shouldClassify', () => {
  it('returns false for very short messages', () => {
    expect(shouldClassify('hi')).toBe(false);
    expect(shouldClassify('find apartment')).toBe(false); // 2 words, < 5
  });

  it('returns false for non-housing messages', () => {
    expect(shouldClassify('what is the weather today in my area')).toBe(false);
    expect(shouldClassify('who won the championship game last night')).toBe(false);
  });

  it('returns true for housing search messages', () => {
    expect(shouldClassify('Find me a 2 bedroom apartment near campus')).toBe(true);
    expect(shouldClassify('I am looking for a studio to rent near university')).toBe(true);
    expect(shouldClassify('searching for housing under 1500 per month')).toBe(true);
  });

  it('returns true for tour request messages', () => {
    expect(shouldClassify('I want to schedule a tour for the apartment')).toBe(true);
    expect(shouldClassify('Book a tour for the Maple Ridge listing please')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classifyIntent
// ---------------------------------------------------------------------------

describe('classifyIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns housing_search for apartment search messages', async () => {
    const { createGeminiClient } = await import('../gemini-client');
    vi.mocked(createGeminiClient).mockReturnValue({
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            intent: 'housing_search',
            confidence: 0.95,
            extracted_fields: { bedrooms: 2, max_rent: 1500 },
          }),
        }),
      },
    } as unknown as ReturnType<typeof createGeminiClient>);

    const result = await classifyIntent('Find me a 2 bedroom apartment under 1500 near campus');
    expect(result.intent).toBe('housing_search');
    expect(result.confidence).toBe(0.95);
    expect(result.extracted_fields).toEqual({ bedrooms: 2, max_rent: 1500 });
  });

  it('returns general_chat fallback when Gemini throws', async () => {
    const { createGeminiClient } = await import('../gemini-client');
    vi.mocked(createGeminiClient).mockReturnValue({
      models: {
        generateContent: vi.fn().mockRejectedValue(new Error('API error')),
      },
    } as unknown as ReturnType<typeof createGeminiClient>);

    const result = await classifyIntent('Find me a studio apartment near campus now');
    expect(result.intent).toBe('general_chat');
    expect(result.confidence).toBe(0);
    expect(result.extracted_fields).toEqual({});
  });

  it('returns general_chat fallback for non-housing messages', async () => {
    // shouldClassify will return false for messages without housing keywords,
    // so classifyIntent returns FALLBACK without calling Gemini at all
    const result = await classifyIntent('hi');
    expect(result.intent).toBe('general_chat');
    expect(result.confidence).toBe(0);
  });

  it('validates and parses Gemini JSON response via Zod', async () => {
    const { createGeminiClient } = await import('../gemini-client');
    // Return an invalid schema response — Zod should reject it, returning FALLBACK
    vi.mocked(createGeminiClient).mockReturnValue({
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            intent: 'unknown_intent', // not a valid enum value
            confidence: 1.5,          // exceeds max(1)
            extracted_fields: {},
          }),
        }),
      },
    } as unknown as ReturnType<typeof createGeminiClient>);

    const result = await classifyIntent('Find me a 2 bedroom apartment for rent near campus');
    // Zod safeParse fails → FALLBACK returned
    expect(result.intent).toBe('general_chat');
    expect(result.confidence).toBe(0);
  });
});
