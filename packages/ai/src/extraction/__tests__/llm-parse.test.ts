/**
 * Unit tests for the LLM-clean rare path (AIN-47, Layer 4).
 *
 * `createLlmExtractor` builds an extractor that asks Gemini to read pruned
 * listing HTML and return a structured field map. It is the last-resort
 * fallback for pages where JSON-LD / OG / DOM extraction all came up short.
 *
 * These tests stub `createGeminiClient` (no network in CI) so we can drive the
 * model's "response" deterministically and assert the graceful-degradation
 * contract: ANY failure (non-JSON, schema mismatch, thrown call) returns `{}`
 * and NEVER throws.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the shared client factory. Each test installs its own `generateContent`
// behaviour via `setModelResponse` / `setModelReject`.
vi.mock('../../gemini-client', () => ({
  createGeminiClient: vi.fn(),
}));

import { createGeminiClient } from '../../gemini-client';
import { createLlmExtractor } from '../llm-parse';

const generateContent = vi.fn();

/** Wire `createGeminiClient` to return a fake client with our spy. */
function installFakeClient(): void {
  vi.mocked(createGeminiClient).mockReturnValue({
    models: { generateContent },
  } as unknown as ReturnType<typeof createGeminiClient>);
}

function setModelText(text: string): void {
  generateContent.mockResolvedValue({ text });
}

function setModelReject(err: unknown): void {
  generateContent.mockRejectedValue(err);
}

beforeEach(() => {
  generateContent.mockReset();
  installFakeClient();
});

describe('createLlmExtractor — prompt construction', () => {
  it('sends a prompt that lists the target fields and includes the html + source url', async () => {
    setModelText('{}');
    const extract = createLlmExtractor();
    const html = '<p>2BR apartment near campus, $1500/mo</p>';
    const url = 'https://example.com/listing/42';
    await extract(html, url);

    expect(generateContent).toHaveBeenCalledTimes(1);
    // The mock is untyped; describe the one argument we inspect so strict-mode
    // TS doesn't flag the deep property access as possibly-undefined.
    const call = generateContent.mock.calls[0]![0] as {
      model: string;
      config: { responseMimeType: string; responseSchema: unknown };
      contents: { role: string; parts: { text: string }[] }[];
    };
    expect(call.model).toBe('gemini-2.5-flash');
    expect(call.config.responseMimeType).toBe('application/json');
    expect(call.config.responseSchema).toBeDefined();

    const prompt: string = call.contents[0]!.parts[0]!.text;
    // Field list present.
    for (const field of ['price', 'bedrooms', 'bathrooms', 'square_feet', 'available_from', 'amenities']) {
      expect(prompt).toContain(field);
    }
    // The pruned html and source url are embedded.
    expect(prompt).toContain(html);
    expect(prompt).toContain(url);
  });
});

describe('createLlmExtractor — happy path', () => {
  it('parses a valid model JSON response into a Partial<ExtractedFields>', async () => {
    setModelText(
      JSON.stringify({
        title: 'Cozy 2BR near State St',
        address: '123 W Gorham St',
        city: 'Madison',
        state: 'WI',
        zip: '53703',
        price: 1500,
        bedrooms: 2,
        bathrooms: 1,
        square_feet: 850,
        available_from: '2026-08-15',
        description: 'Bright corner unit.',
        amenities: ['In-unit laundry', 'Dishwasher'],
        photos: ['https://example.com/a.jpg'],
      }),
    );
    const extract = createLlmExtractor();
    const result = await extract('<html>...</html>', 'https://example.com/x');

    expect(result).toEqual({
      title: 'Cozy 2BR near State St',
      address: '123 W Gorham St',
      city: 'Madison',
      state: 'WI',
      zip: '53703',
      price: 1500,
      bedrooms: 2,
      bathrooms: 1,
      square_feet: 850,
      available_from: '2026-08-15',
      description: 'Bright corner unit.',
      amenities: ['In-unit laundry', 'Dishwasher'],
      photos: ['https://example.com/a.jpg'],
    });
  });

  it('returns only the fields the model was confident about (omits absent fields)', async () => {
    setModelText(JSON.stringify({ price: 1200, bedrooms: 1 }));
    const extract = createLlmExtractor();
    const result = await extract('<html>...</html>', 'https://example.com/x');
    expect(result).toEqual({ price: 1200, bedrooms: 1 });
    expect(result.title).toBeUndefined();
  });

  it('returns {} when the model returns an empty object (could not parse a listing)', async () => {
    setModelText('{}');
    const extract = createLlmExtractor();
    const result = await extract('<html>not a listing</html>', 'https://example.com/x');
    expect(result).toEqual({});
  });
});

describe('createLlmExtractor — graceful degradation', () => {
  it('returns {} when the model returns non-JSON text (no throw)', async () => {
    setModelText('Sorry, I cannot help with that.');
    const extract = createLlmExtractor();
    await expect(extract('<html>...</html>', 'https://example.com/x')).resolves.toEqual({});
  });

  it('returns {} when the JSON fails the Zod schema (price as object)', async () => {
    setModelText(JSON.stringify({ price: { amount: 1500 }, bedrooms: 2 }));
    const extract = createLlmExtractor();
    await expect(extract('<html>...</html>', 'https://example.com/x')).resolves.toEqual({});
  });

  it('returns {} when generateContent rejects (no throw)', async () => {
    setModelReject(new Error('Vertex 503'));
    const extract = createLlmExtractor();
    await expect(extract('<html>...</html>', 'https://example.com/x')).resolves.toEqual({});
  });

  it('returns {} when result.text is undefined', async () => {
    generateContent.mockResolvedValue({ text: undefined });
    const extract = createLlmExtractor();
    await expect(extract('<html>...</html>', 'https://example.com/x')).resolves.toEqual({});
  });
});
