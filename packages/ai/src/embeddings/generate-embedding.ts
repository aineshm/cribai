/**
 * Gemini embedding wrapper for listing and query embeddings.
 * Uses embedding-001 model with asymmetric task types:
 * - RETRIEVAL_DOCUMENT for listing text (what is being indexed)
 * - RETRIEVAL_QUERY for search queries (what the user is looking for)
 */

import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-embedding-001';
const DIMENSIONS = 768;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Generate embedding for a listing document (indexed content).
 * Uses RETRIEVAL_DOCUMENT task type for asymmetric retrieval.
 */
export async function generateEmbedding(text: string): Promise<readonly number[]> {
  const ai = getClient();
  const response = await ai.models.embedContent({
    model: MODEL,
    contents: text,
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: DIMENSIONS,
    },
  });

  if (!response.embedding?.values) {
    throw new Error('Embedding response missing values');
  }

  return Object.freeze([...response.embedding.values]);
}

/**
 * Generate embedding for a search query.
 * Uses RETRIEVAL_QUERY task type for asymmetric retrieval.
 */
export async function generateQueryEmbedding(query: string): Promise<readonly number[]> {
  const ai = getClient();
  const response = await ai.models.embedContent({
    model: MODEL,
    contents: query,
    config: {
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: DIMENSIONS,
    },
  });

  if (!response.embedding?.values) {
    throw new Error('Embedding response missing values');
  }

  return Object.freeze([...response.embedding.values]);
}
