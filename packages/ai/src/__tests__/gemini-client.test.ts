import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGoogleGenAI = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAI,
}));

describe('createGeminiClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    mockGoogleGenAI.mockClear();
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_LOCATION;
    delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  });

  it('uses AI Studio when GEMINI_API_KEY and GOOGLE_CLOUD_PROJECT are both set', async () => {
    process.env.GEMINI_API_KEY = 'test-api-key';
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

    const { createGeminiClient } = await import('../gemini-client');
    createGeminiClient();

    expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
  });

  it('uses Vertex AI when explicitly requested', async () => {
    process.env.GEMINI_API_KEY = 'test-api-key';
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    process.env.GOOGLE_CLOUD_LOCATION = 'us-east5';
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';

    const { createGeminiClient } = await import('../gemini-client');
    createGeminiClient();

    expect(mockGoogleGenAI).toHaveBeenCalledWith({
      vertexai: true,
      project: 'test-project',
      location: 'us-east5',
    });
  });

  it('uses the default Vertex AI location when the env var is empty', async () => {
    process.env.GEMINI_API_KEY = 'test-api-key';
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    process.env.GOOGLE_CLOUD_LOCATION = '';
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';

    const { createGeminiClient } = await import('../gemini-client');
    createGeminiClient();

    expect(mockGoogleGenAI).toHaveBeenCalledWith({
      vertexai: true,
      project: 'test-project',
      location: 'us-central1',
    });
  });
});
