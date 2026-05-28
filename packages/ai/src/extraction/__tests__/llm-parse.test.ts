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

import { Type } from '@google/genai';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock the shared client factory. Each test installs its own `generateContent`
// behaviour via `setModelResponse` / `setModelReject`.
vi.mock('../../gemini-client', () => ({
  createGeminiClient: vi.fn(),
}));

import { createGeminiClient } from '../../gemini-client';
import { LlmExtractionSchema, RESPONSE_SCHEMA, createLlmExtractor } from '../llm-parse';

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

// ---------------------------------------------------------------------------
// Schema drift guard
// ---------------------------------------------------------------------------

/**
 * `LlmExtractionSchema` (Zod, the post-parse validator) and `RESPONSE_SCHEMA`
 * (the Gemini-side OpenAPI-style schema) are two hand-maintained lists of the
 * same fields. If they drift — a field added to one but not the other, or a
 * scalar/array kind that disagrees — the extractor silently mis-extracts
 * instead of failing loudly. These tests pin the two together so drift fails
 * CI at the unit level.
 *
 * We classify each schema down to a coarse kind ('scalar' | 'array') because
 * that's the only distinction that affects validation: a Zod `z.array(...)`
 * must line up with a Gemini `Type.ARRAY`, and everything else is a scalar.
 */
type FieldKind = 'scalar' | 'array';

/** Reduce a Zod field (possibly `.optional()`) to its coarse kind. */
function zodKind(schema: z.ZodTypeAny): FieldKind {
  const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema;
  return inner instanceof z.ZodArray ? 'array' : 'scalar';
}

/** Reduce a Gemini property descriptor to its coarse kind. */
function geminiKind(prop: { type: Type }): FieldKind {
  return prop.type === Type.ARRAY ? 'array' : 'scalar';
}

describe('schema drift guard — LlmExtractionSchema ↔ RESPONSE_SCHEMA', () => {
  const zodShape = LlmExtractionSchema.shape;
  const geminiProps = RESPONSE_SCHEMA.properties;

  it('declares the identical set of field names in both schemas', () => {
    const zodKeys = Object.keys(zodShape).sort();
    const geminiKeys = Object.keys(geminiProps).sort();
    expect(geminiKeys).toEqual(zodKeys);
  });

  it('agrees on scalar/array kind for every field', () => {
    const zodKinds = Object.fromEntries(
      Object.entries(zodShape).map(([name, schema]) => [name, zodKind(schema as z.ZodTypeAny)]),
    );
    const geminiKinds = Object.fromEntries(
      Object.entries(geminiProps).map(([name, prop]) => [name, geminiKind(prop as { type: Type })]),
    );
    expect(geminiKinds).toEqual(zodKinds);
  });
});
