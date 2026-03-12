/**
 * steering-parser.test.ts — Unit tests for parseSteeringIntent.
 *
 * Mocks Gemini client to test schema validation, fallback behaviour,
 * prompt construction, and API config correctness.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock Gemini before imports ────────────────────────────────
vi.mock('../../gemini-client', () => ({
  createGeminiClient: vi.fn(),
}));

import { parseSteeringIntent } from '../steering-parser';
import { createGeminiClient } from '../../gemini-client';

// ── Helpers ───────────────────────────────────────────────────

const mockGenerateContent = vi.fn();

function mockGemini(responseText: string) {
  vi.mocked(createGeminiClient).mockReturnValue({
    models: { generateContent: mockGenerateContent },
  } as unknown as ReturnType<typeof createGeminiClient>);
  mockGenerateContent.mockResolvedValue({ text: responseText });
}

const baseInput = { bedrooms: 2, maxRent: 1500, topN: 5 };

// ── Tests ─────────────────────────────────────────────────────

describe('parseSteeringIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns partial update for maxRent change', async () => {
    mockGemini(JSON.stringify({ maxRent: 1200 }));
    const result = await parseSteeringIntent(
      'actually make it under $1200',
      'housing_search',
      baseInput,
    );
    expect(result).toEqual({ maxRent: 1200 });
  });

  it('returns partial update for bedrooms change', async () => {
    mockGemini(JSON.stringify({ bedrooms: 1 }));
    const result = await parseSteeringIntent('change to 1 bedroom', 'housing_search', baseInput);
    expect(result).toEqual({ bedrooms: 1 });
  });

  it('returns partial update for availability change (tour_outreach)', async () => {
    const availability = { daysOfWeek: ['Wednesday'], timeWindows: ['evening'] };
    mockGemini(JSON.stringify({ availability }));
    const result = await parseSteeringIntent(
      "I'm now free Wednesday evenings",
      'tour_outreach',
      { listingIds: ['a', 'b'], studentName: 'Alex' },
    );
    expect(result).toEqual({ availability });
  });

  it('returns empty object when Gemini says nothing actionable', async () => {
    mockGemini('{}');
    const result = await parseSteeringIntent('never mind', 'housing_search', baseInput);
    // Must be {} (not null) so the steering still gets marked applied
    expect(result).toEqual({});
    expect(result).not.toBeNull();
  });

  it('returns null when Gemini throws', async () => {
    vi.mocked(createGeminiClient).mockReturnValue({
      models: { generateContent: vi.fn().mockRejectedValue(new Error('API error')) },
    } as unknown as ReturnType<typeof createGeminiClient>);
    const result = await parseSteeringIntent('lower budget', 'housing_search', baseInput);
    expect(result).toBeNull();
  });

  it('returns null when Gemini returns invalid JSON', async () => {
    mockGemini('this is not json');
    const result = await parseSteeringIntent('lower budget', 'housing_search', baseInput);
    expect(result).toBeNull();
  });

  it('returns null when Zod validation fails (negative maxRent)', async () => {
    mockGemini(JSON.stringify({ maxRent: -500 }));
    const result = await parseSteeringIntent('lower budget', 'housing_search', baseInput);
    expect(result).toBeNull();
  });

  it('returns null when Gemini returns unknown keys (strict mode)', async () => {
    mockGemini(JSON.stringify({ maxRent: 1200, unknownField: 'oops' }));
    const result = await parseSteeringIntent('lower budget', 'housing_search', baseInput);
    expect(result).toBeNull();
  });

  it('includes missionType and currentInput in the prompt', async () => {
    mockGemini('{}');
    await parseSteeringIntent('lower budget', 'housing_search', baseInput);

    const callArgs = mockGenerateContent.mock.calls[0]![0] as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = callArgs.contents[0]!.parts[0]!.text;

    expect(prompt).toContain('housing_search');
    expect(prompt).toContain('"maxRent": 1500');
  });

  it('uses responseMimeType application/json and no tools config', async () => {
    mockGemini('{}');
    await parseSteeringIntent('lower budget', 'housing_search', baseInput);

    const callArgs = mockGenerateContent.mock.calls[0]![0] as {
      config: { responseMimeType: string; tools?: unknown };
    };

    expect(callArgs.config.responseMimeType).toBe('application/json');
    expect(callArgs.config.tools).toBeUndefined();
  });

  it('returns null when Gemini returns null text', async () => {
    vi.mocked(createGeminiClient).mockReturnValue({
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: null }),
      },
    } as unknown as ReturnType<typeof createGeminiClient>);
    const result = await parseSteeringIntent('lower budget', 'housing_search', baseInput);
    // null text falls back to '{}' → SteeringUpdateSchema parses {} → returns {}
    expect(result).toEqual({});
  });
});
