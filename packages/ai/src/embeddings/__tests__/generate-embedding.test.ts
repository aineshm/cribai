import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @google/genai before importing the module
const mockEmbedContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      embedContent: mockEmbedContent,
    },
  })),
}));

// Set env before importing module
process.env.GEMINI_API_KEY = 'test-key';

import { generateEmbedding, generateQueryEmbedding } from '../generate-embedding';

describe('generateEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedContent.mockResolvedValue({
      embedding: { values: Array(768).fill(0.1) },
    });
  });

  it('calls embedContent with RETRIEVAL_DOCUMENT task type', async () => {
    await generateEmbedding('test listing text');

    expect(mockEmbedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-embedding-001',
        contents: 'test listing text',
        config: expect.objectContaining({
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: 768,
        }),
      }),
    );
  });

  it('returns a readonly array of numbers', async () => {
    const result = await generateEmbedding('test text');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(768);
    expect(typeof result[0]).toBe('number');
  });
});

describe('generateQueryEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedContent.mockResolvedValue({
      embedding: { values: Array(768).fill(0.2) },
    });
  });

  it('calls embedContent with RETRIEVAL_QUERY task type', async () => {
    await generateQueryEmbedding('quiet apartment near campus');

    expect(mockEmbedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-embedding-001',
        contents: 'quiet apartment near campus',
        config: expect.objectContaining({
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: 768,
        }),
      }),
    );
  });

  it('returns a readonly array of numbers', async () => {
    const result = await generateQueryEmbedding('test query');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(768);
  });
});
