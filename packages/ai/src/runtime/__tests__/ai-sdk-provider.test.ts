/**
 * PDR-004 Track A Days 3-4 — AI SDK provider factory tests (AIN-8)
 *
 * Mirrors the backend-selection logic in `gemini-client.ts`:
 *   - GEMINI_API_KEY set (and not forced to Vertex) → AI Studio
 *   - GOOGLE_CLOUD_PROJECT set → Vertex AI
 *   - GOOGLE_GENAI_USE_VERTEXAI=true forces Vertex even when an API key exists
 *   - Neither configured → throws
 *
 * No live network — these assertions only exercise which backend the factory
 * selects. We mock the underlying provider factories so the test never tries
 * to reach Google.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const createVertexSpy = vi.fn((_opts?: unknown) => {
  const provider = vi.fn((modelId: string) => ({ __backend: 'vertex', modelId }));
  return provider;
});
const createGoogleSpy = vi.fn((_opts?: unknown) => {
  const provider = vi.fn((modelId: string) => ({ __backend: 'ai_studio', modelId }));
  return provider;
});

vi.mock('@ai-sdk/google-vertex', () => ({
  createVertex: (opts: unknown) => createVertexSpy(opts as never),
}));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: (opts: unknown) => createGoogleSpy(opts as never),
}));

// FIX 1 (AIN-8 review) — stub node:fs so the credential-materialization path
// (shared with gemini-client via the exported `ensureVertexCredentials`) is
// observable without touching the real filesystem.
const writeFileSyncSpy = vi.fn();
vi.mock('node:fs', () => ({
  default: { writeFileSync: (...args: unknown[]) => writeFileSyncSpy(...args) },
  writeFileSync: (...args: unknown[]) => writeFileSyncSpy(...args),
}));

import { createAiSdkModel, AI_SDK_MODEL_ID } from '../ai-sdk-provider';

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_GENAI_USE_VERTEXAI',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
] as const;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

afterEach(() => {
  clearEnv();
  createVertexSpy.mockClear();
  createGoogleSpy.mockClear();
  writeFileSyncSpy.mockClear();
});

describe('createAiSdkModel — backend selection', () => {
  it('uses AI Studio when GEMINI_API_KEY is set and Vertex is not forced', () => {
    clearEnv();
    process.env.GEMINI_API_KEY = 'test-key';

    const model = createAiSdkModel() as unknown as { __backend: string; modelId: string };

    expect(createGoogleSpy).toHaveBeenCalledTimes(1);
    expect(createVertexSpy).not.toHaveBeenCalled();
    expect(model.__backend).toBe('ai_studio');
    expect(model.modelId).toBe(AI_SDK_MODEL_ID);
  });

  it('uses Vertex when GOOGLE_CLOUD_PROJECT is set and no API key', () => {
    clearEnv();
    process.env.GOOGLE_CLOUD_PROJECT = 'cribai-prod';

    const model = createAiSdkModel() as unknown as { __backend: string };

    expect(createVertexSpy).toHaveBeenCalledTimes(1);
    expect(createGoogleSpy).not.toHaveBeenCalled();
    expect(model.__backend).toBe('vertex');
  });

  it('forces Vertex when GOOGLE_GENAI_USE_VERTEXAI=true even with an API key', () => {
    clearEnv();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GOOGLE_CLOUD_PROJECT = 'cribai-prod';
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';

    const model = createAiSdkModel() as unknown as { __backend: string };

    expect(createVertexSpy).toHaveBeenCalledTimes(1);
    expect(createGoogleSpy).not.toHaveBeenCalled();
    expect(model.__backend).toBe('vertex');
  });

  it('passes project + location into the Vertex factory', () => {
    clearEnv();
    process.env.GOOGLE_CLOUD_PROJECT = 'cribai-prod';
    process.env.GOOGLE_CLOUD_LOCATION = 'us-east1';

    createAiSdkModel();

    expect(createVertexSpy).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'cribai-prod', location: 'us-east1' }),
    );
  });

  it('defaults Vertex location to us-central1 when unset', () => {
    clearEnv();
    process.env.GOOGLE_CLOUD_PROJECT = 'cribai-prod';

    createAiSdkModel();

    expect(createVertexSpy).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'us-central1' }),
    );
  });

  it('passes apiKey override into the AI Studio factory', () => {
    clearEnv();
    createAiSdkModel({ apiKey: 'override-key' });

    expect(createGoogleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'override-key' }),
    );
  });

  it('throws when neither backend is configured', () => {
    clearEnv();
    expect(() => createAiSdkModel()).toThrow(/not configured/i);
  });
});

describe('createAiSdkModel — Vertex credential materialization (FIX 1)', () => {
  it('materializes GOOGLE_APPLICATION_CREDENTIALS_JSON to a temp file before creating the Vertex model', () => {
    clearEnv();
    process.env.GOOGLE_CLOUD_PROJECT = 'cribai-prod';
    // Serverless shape: inline JSON present, file path NOT set.
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      type: 'service_account',
      project_id: 'cribai-prod',
    });

    createAiSdkModel();

    // The shared gemini-client logic must have written the key to a temp file
    // and set GOOGLE_APPLICATION_CREDENTIALS so the Vertex provider's ADC
    // lookup succeeds on a cold serverless start.
    expect(writeFileSyncSpy).toHaveBeenCalledTimes(1);
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeDefined();
    expect(createVertexSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT materialize credentials when GOOGLE_APPLICATION_CREDENTIALS is already set', () => {
    clearEnv();
    process.env.GOOGLE_CLOUD_PROJECT = 'cribai-prod';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/already/configured.json';
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({ type: 'sa' });

    createAiSdkModel();

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(createVertexSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT materialize credentials on the AI Studio path', () => {
    clearEnv();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({ type: 'sa' });

    createAiSdkModel();

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(createGoogleSpy).toHaveBeenCalledTimes(1);
  });
});
