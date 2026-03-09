/**
 * Shared Gemini client factory.
 *
 * Auto-detects backend based on environment variables:
 * - GOOGLE_CLOUD_PROJECT set → Vertex AI (uses Application Default Credentials)
 * - GEMINI_API_KEY set → Google AI Studio (API key auth)
 *
 * Vertex AI is preferred when both are set.
 */

import { GoogleGenAI } from '@google/genai';

export function createGeminiClient(apiKeyOverride?: string): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';

  // Prefer Vertex AI when project is configured
  if (project) {
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }

  // Fall back to AI Studio API key
  const apiKey = apiKeyOverride ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Gemini not configured. Set GOOGLE_CLOUD_PROJECT for Vertex AI, or GEMINI_API_KEY for AI Studio.',
    );
  }

  return new GoogleGenAI({ apiKey });
}
