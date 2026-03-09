/**
 * Gemini embedding wrapper for listing and query embeddings.
 * Uses embedding-001 model with asymmetric task types:
 * - RETRIEVAL_DOCUMENT for listing text (what is being indexed)
 * - RETRIEVAL_QUERY for search queries (what the user is looking for)
 */

import { createGeminiClient } from '../gemini-client';

const MODEL = 'gemini-embedding-001';
const DIMENSIONS = 768;

/**
 * Generate embedding for a listing document (indexed content).
 * Uses RETRIEVAL_DOCUMENT task type for asymmetric retrieval.
 */
export async function generateEmbedding(text: string): Promise<readonly number[]> {
  const ai = createGeminiClient();
  const response = await ai.models.embedContent({
    model: MODEL,
    contents: text,
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: DIMENSIONS,
    },
  });

  // Support both old (embedding) and new (embeddings) API shapes
  const values = response.embeddings?.[0]?.values
    ?? (response as unknown as { embedding?: { values?: number[] } }).embedding?.values;

  if (!values) {
    throw new Error('Embedding response missing values');
  }

  return Object.freeze([...values]);
}

/**
 * Generate embedding for a search query.
 * Uses RETRIEVAL_QUERY task type for asymmetric retrieval.
 */
export async function generateQueryEmbedding(query: string): Promise<readonly number[]> {
  const ai = createGeminiClient();
  const response = await ai.models.embedContent({
    model: MODEL,
    contents: query,
    config: {
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: DIMENSIONS,
    },
  });

  // Support both old (embedding) and new (embeddings) API shapes
  const values = response.embeddings?.[0]?.values
    ?? (response as unknown as { embedding?: { values?: number[] } }).embedding?.values;

  if (!values) {
    throw new Error('Embedding response missing values');
  }

  return Object.freeze([...values]);
}
