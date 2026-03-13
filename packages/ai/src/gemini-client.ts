/**
 * Shared Gemini client factory.
 *
 * Auto-detects backend based on environment variables:
 * - GOOGLE_CLOUD_PROJECT set → Vertex AI (uses Application Default Credentials)
 *   Supports inline JSON via GOOGLE_APPLICATION_CREDENTIALS_JSON (for serverless)
 * - GEMINI_API_KEY set → Google AI Studio (API key auth)
 *
 * Vertex AI is preferred when both are set.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

function ensureVertexCredentials(): void {
  // Already have a file path configured
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;

  // Support inline JSON credentials for serverless environments (Vercel, etc.)
  const inlineJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!inlineJson) return;

  const credFile = path.join(os.tmpdir(), 'gcp-sa-key.json');
  fs.writeFileSync(credFile, inlineJson, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credFile;
}

export function createGeminiClient(apiKeyOverride?: string): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';

  // Prefer Vertex AI when project is configured
  if (project) {
    ensureVertexCredentials();
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
