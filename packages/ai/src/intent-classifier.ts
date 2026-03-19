/**
 * Intent classifier for CribAI.
 *
 * Classifies student housing messages into mission intents using Gemini.
 * Always returns a result — never throws. Falls back to `general_chat` on error.
 *
 * Note: Uses `responseMimeType: 'application/json'` without tools config.
 * Gemini cannot combine `tools` + `responseSchema` — JSON mode only for steering.
 */
import { z } from 'zod';
import { createGeminiClient } from './gemini-client';

// ---------------------------------------------------------------------------
// Schema + types
// ---------------------------------------------------------------------------

const IntentResultSchema = z.object({
  intent: z.enum(['housing_search', 'tour_outreach', 'listing_deep_dive', 'sublease_post', 'lease_analysis', 'general_chat']),
  confidence: z.number().min(0).max(1),
  extracted_fields: z.record(z.unknown()),
});

export type IntentResult = z.infer<typeof IntentResultSchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FALLBACK: IntentResult = {
  intent: 'general_chat',
  confidence: 0,
  extracted_fields: {},
};

const HOUSING_KEYWORDS = [
  'find', 'search', 'apartment', 'housing', 'tour', 'lease',
  'rent', 'bedroom', 'studio', 'looking for', 'place to live',
  'sublease', 'roommate', 'move in', 'move-in',
];

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Determines whether a message is worth classifying.
 * Short messages and non-housing content are filtered out to avoid
 * unnecessary Gemini calls.
 */
export function shouldClassify(message: string): boolean {
  const lower = message.toLowerCase();
  const wordCount = message.trim().split(/\s+/).length;
  return wordCount >= 5 && HOUSING_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Classifies the intent of a student housing message.
 * Returns FALLBACK (`general_chat`, confidence 0) on error or non-housing input.
 */
export async function classifyIntent(message: string, apiKey?: string): Promise<IntentResult> {
  if (!shouldClassify(message)) return FALLBACK;

  const ai = createGeminiClient(apiKey);
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        responseMimeType: 'application/json',
        // NOTE: NO tools config here — responseSchema + tools are mutually exclusive in Gemini
      },
      contents: [{ role: 'user', parts: [{ text: buildClassifyPrompt(message) }] }],
    });
    const raw = result.text ?? '{}';
    const parsed = IntentResultSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Builds the classification prompt for Gemini. */
function buildClassifyPrompt(message: string): string {
  return `Classify this student housing message into exactly one intent.

Message: "${message}"

Return JSON with:
- intent: one of housing_search | tour_outreach | listing_deep_dive | sublease_post | lease_analysis | general_chat
- confidence: 0.0–1.0 (how confident you are)
- extracted_fields: relevant fields (e.g. bedrooms, budget, location, move_in_date)

Examples:
- "Find me a 2BR under $1,500 near campus" → housing_search, confidence ~0.95, extracted_fields: {bedrooms: 2, max_rent: 1500}
- "Book a tour for the Maple Ridge listing" → tour_outreach, confidence ~0.90
- "What does this lease clause mean?" → lease_analysis, confidence ~0.85
- "What time does the leasing office open?" → general_chat, confidence ~0.90`;
}
