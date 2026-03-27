import { createGoogleGenerativeAI } from '@ai-sdk/google';

/**
 * Creates a Google Generative AI provider for the Vercel AI SDK.
 * Falls back through GEMINI_API_KEY -> GOOGLE_API_KEY env vars.
 */
export function createAiSdkProvider(apiKey?: string) {
  const key = apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error('Missing Gemini API key for AI SDK provider');
  }
  return createGoogleGenerativeAI({ apiKey: key });
}
