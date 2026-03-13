/**
 * Steering intent parser — converts a raw mid-mission correction into a
 * structured partial input update using Gemini JSON mode.
 *
 * Returns a partial record of fields to merge into mission.input, or null
 * on parse/API failure (steering will be retried on the next step).
 * Returns an empty object {} when Gemini determines nothing actionable was
 * said (steering is consumed but no fields are updated).
 *
 * Note: Uses `responseMimeType: 'application/json'` without tools config.
 * Gemini cannot combine `tools` + `responseSchema`.
 */

import { z } from 'zod';
import { createGeminiClient } from '../gemini-client';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Covers all steerable fields across housing_search and tour_outreach missions.
 * Uses .strict() so unexpected keys from Gemini cause safeParse to fail cleanly
 * rather than merging unknown data into mission.input.
 */
const SteeringUpdateSchema = z
  .object({
    // housing_search fields
    bedrooms: z.number().int().min(0).optional(),
    maxRent: z.number().positive().optional(),
    moveInDate: z.string().optional(),
    dealbreakers: z.array(z.string()).optional(),
    preferences: z.string().optional(),
    topN: z.number().int().min(1).max(10).optional(),

    // tour_outreach fields
    availability: z
      .object({
        daysOfWeek: z.array(z.string()),
        timeWindows: z.array(z.string()),
      })
      .optional(),
    customNote: z.string().optional(),
  })
  .strict();

export type SteeringUpdate = z.infer<typeof SteeringUpdateSchema>;

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Parse a raw mid-mission steering message into a partial input update.
 *
 * @param rawInput   - The user's natural-language correction.
 * @param missionType - e.g. 'housing_search' or 'tour_outreach'.
 * @param currentInput - The mission's current input record (used as context).
 * @returns Partial record to merge into mission.input, {} if nothing actionable,
 *          or null if parsing failed.
 */
export async function parseSteeringIntent(
  rawInput: string,
  missionType: string,
  currentInput: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown> | null> {
  const ai = createGeminiClient();
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        responseMimeType: 'application/json',
        // NOTE: NO tools config — responseSchema + tools are mutually exclusive in Gemini
      },
      contents: [{ role: 'user', parts: [{ text: buildPrompt(rawInput, missionType, currentInput) }] }],
    });

    const raw = result.text ?? '{}';
    const parsed = SteeringUpdateSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      return null;
    }

    // Return the parsed object (may be empty — caller distinguishes {} from null)
    return parsed.data as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildPrompt(
  rawInput: string,
  missionType: string,
  currentInput: Readonly<Record<string, unknown>>,
): string {
  return `You are a mission parameter extractor for a student housing assistant.

Mission type: ${missionType}
Current parameters: ${JSON.stringify(currentInput, null, 2)}

The user submitted this mid-mission correction:
"${rawInput}"

Extract ONLY the fields the user explicitly changed or mentioned.
Do NOT echo back unchanged fields.
Return valid JSON (all fields optional):
{
  "bedrooms": integer,
  "maxRent": positive number,
  "moveInDate": "YYYY-MM-DD",
  "dealbreakers": ["string"],
  "preferences": "string",
  "topN": integer 1-10,
  "availability": { "daysOfWeek": ["string"], "timeWindows": ["string"] },
  "customNote": "string"
}

Examples:
- "actually make it under $1200" → { "maxRent": 1200 }
- "change to 1 bedroom" → { "bedrooms": 1 }
- "I'm now free Wednesday evenings" → { "availability": { "daysOfWeek": ["Wednesday"], "timeWindows": ["evening"] } }
- "ignore the gym requirement" → { "dealbreakers": [] }

If nothing is actionable, return {}`;
}
