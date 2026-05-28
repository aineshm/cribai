/**
 * Shared Gemini client factory.
 *
 * Auto-detects backend based on environment variables:
 * - GEMINI_API_KEY set → Google AI Studio (API key auth)
 * - GOOGLE_CLOUD_PROJECT set → Vertex AI (uses Application Default Credentials)
 *   Supports inline JSON via GOOGLE_APPLICATION_CREDENTIALS_JSON (for serverless)
 *
 * AI Studio is preferred when both are set unless GOOGLE_GENAI_USE_VERTEXAI=true.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

/**
 * Materialize Vertex AI credentials for serverless environments.
 *
 * On Vercel (and similar) there is no well-known ADC file, so the service
 * account key is supplied inline via `GOOGLE_APPLICATION_CREDENTIALS_JSON`
 * (base64 or plain JSON). This writes it to a temp file and points
 * `GOOGLE_APPLICATION_CREDENTIALS` at it so the Google auth library's ADC
 * lookup succeeds. No-ops when a file path is already configured (local ADC)
 * or no inline JSON is present.
 *
 * Exported so the LLM-first AI SDK provider (`createAiSdkModel`) reuses the
 * EXACT same logic as the deterministic `createGeminiClient` — single source
 * of truth for Vertex auth across both runtimes.
 */
export function ensureVertexCredentials(): void {
  // Already have a file path configured
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;

  // Support credentials for serverless environments (Vercel, etc.)
  // Stored as base64 to avoid newline corruption during env var storage
  const inlineJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!inlineJson) return;

  // Decode base64 if needed, otherwise use as-is (plain JSON fallback)
  let json: string;
  try {
    const decoded = Buffer.from(inlineJson.trim(), 'base64').toString('utf8');
    JSON.parse(decoded); // validate it's real JSON
    json = decoded;
  } catch {
    json = inlineJson; // already plain JSON
  }

  const credFile = path.join(os.tmpdir(), 'gcp-sa-key.json');
  fs.writeFileSync(credFile, json, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credFile;
}

export function createGeminiClient(apiKeyOverride?: string): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const apiKey = apiKeyOverride ?? process.env.GEMINI_API_KEY;
  const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';

  // Prefer the API key when present. A stray GOOGLE_CLOUD_PROJECT without
  // credentials should not force local/dev deployments onto Vertex AI.
  if (apiKey && !useVertex) {
    return new GoogleGenAI({ apiKey });
  }

  if (project) {
    ensureVertexCredentials(); // shared with createAiSdkModel — single source of truth
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }

  if (!apiKey) {
    throw new Error(
      'Gemini not configured. Set GOOGLE_CLOUD_PROJECT for Vertex AI, or GEMINI_API_KEY for AI Studio.',
    );
  }

  return new GoogleGenAI({ apiKey });
}
