/**
 * Gemini embedding wrapper for listing and query embeddings.
 * Uses gemini-embedding-001 with asymmetric task types:
 * - RETRIEVAL_DOCUMENT for listing text (what is being indexed)
 * - RETRIEVAL_QUERY for search queries (what the user is looking for)
 *
 * gemini-embedding-001 is the current GA recommended Vertex AI embedding model
 * (released 2025-05-20, up to 3072 dimensions). The @google/genai SDK v1.42.0+
 * correctly routes it to the Vertex AI :predict endpoint with instances-wrapped
 * request body. text-embedding-004 is the older gecko-lineage model retiring
 * April 2027. We use outputDimensionality: 768 to stay compatible with the
 * existing pgvector column and Pinecone index dimensions.
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
