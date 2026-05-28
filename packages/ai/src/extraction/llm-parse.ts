/**
 * LLM-clean rare path for listing extraction (AIN-47, Layer 4 / Day 6).
 *
 * When the structured-data paths (JSON-LD, OpenGraph) and the DOM-fallback
 * extractors all come up short, we hand the pruned page text to Gemini and ask
 * it to read out the listing fields. This is a LAST-RESORT, low-volume path —
 * it costs a model call per page, so the entry point only escalates here when
 * cheaper extractors produced too little.
 *
 * Contract (mirrors `intent-classifier.ts`): the extractor NEVER throws. Any
 * failure — a non-JSON response, a schema mismatch, or a thrown/ rejected
 * model call — degrades gracefully to `{}`. The returned fields are RAW: the
 * entry point (`index.ts`) runs `normalizeFields` on the merged result, so we
 * deliberately do NOT clamp lengths, filter photo schemes, or validate dates
 * here.
 *
 * Note (mirrors `intent-classifier.ts`): we use `responseMimeType:
 * 'application/json'` + `responseSchema` and NO `tools` config — Gemini cannot
 * combine `tools` with a `responseSchema`.
 */

import { Type } from '@google/genai';
import { z } from 'zod';

import { createGeminiClient } from '../gemini-client';
import type { ExtractedFields, LlmExtractor } from './types';

// ---------------------------------------------------------------------------
// Schema + types
// ---------------------------------------------------------------------------

/**
 * Zod schema for the model's JSON response. Every field is OPTIONAL — the
 * prompt instructs the model to return only fields it is confident about, and
 * to return `{}` when the page isn't a parseable listing. Field names match
 * `ExtractedFields` exactly so the result drops straight into the merge step.
 *
 * `price` / `bedrooms` / `bathrooms` / `square_feet` are numbers (monthly rent
 * in USD for `price`); a model returning a string or object for these fails
 * `safeParse` and the whole result degrades to `{}` — by design, we'd rather
 * skip a bad LLM result than feed garbage downstream.
 *
 * MUST stay in sync with `RESPONSE_SCHEMA` below (same field set / types).
 */
const LlmExtractionSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  price: z.number().optional(),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
  square_feet: z.number().optional(),
  available_from: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  photos: z.array(z.string()).optional(),
});

/**
 * Gemini-side response schema (OpenAPI-style, NOT a Zod schema — those are not
 * interchangeable in `@google/genai`). Steers the model to emit a flat JSON
 * object with the fields we want. Kept in lockstep with `LlmExtractionSchema`
 * above; the Zod schema is the authoritative validator after `JSON.parse`.
 */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    address: { type: Type.STRING },
    city: { type: Type.STRING },
    state: { type: Type.STRING },
    zip: { type: Type.STRING },
    price: { type: Type.NUMBER },
    bedrooms: { type: Type.NUMBER },
    bathrooms: { type: Type.NUMBER },
    square_feet: { type: Type.NUMBER },
    available_from: { type: Type.STRING },
    amenities: { type: Type.ARRAY, items: { type: Type.STRING } },
    photos: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
} as const;

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Build the production LLM extractor. Lazily constructs a Gemini client on
 * each call (the client is cheap to build and this path is rare). The returned
 * function satisfies the `LlmExtractor` contract and never throws.
 */
export function createLlmExtractor(): LlmExtractor {
  return async (prunedHtml: string, sourceUrl: string): Promise<Partial<ExtractedFields>> => {
    try {
      const ai = createGeminiClient();
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          // NOTE: NO tools config here — responseSchema + tools are mutually
          // exclusive in Gemini (same constraint as intent-classifier.ts).
        },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(prunedHtml, sourceUrl) }] }],
      });

      const raw = result.text;
      if (typeof raw !== 'string' || raw.length === 0) return {};

      const parsed = LlmExtractionSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : {};
    } catch {
      // Non-JSON text, schema mismatch, or a thrown/rejected model call — this
      // is a best-effort fallback, so degrade silently to "no fields".
      return {};
    }
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Builds the extraction prompt for Gemini. */
function buildPrompt(prunedHtml: string, sourceUrl: string): string {
  return `You are extracting a rental housing listing from a web page.

Return ONLY a JSON object with the fields you are confident about. Omit any
field you cannot determine. If the page is not a single rental listing, return {}.

Fields:
- title: short listing title
- description: free-text description
- address: street address
- city, state, zip: location parts
- price: MONTHLY rent in USD as a plain number (no currency symbol, no range)
- bedrooms, bathrooms: numbers (bathrooms may be fractional, e.g. 1.5)
- square_feet: number
- available_from: move-in date string
- amenities: array of strings
- photos: array of image URLs

Source URL: ${sourceUrl}

Page content:
${prunedHtml}`;
}
