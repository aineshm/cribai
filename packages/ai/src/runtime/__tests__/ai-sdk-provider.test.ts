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
// PR 2 — OpenAI provider mock, mirroring the Google spies. No live network.
const createOpenAISpy = vi.fn((_opts?: unknown) => {
  const provider = vi.fn((modelId: string) => ({ __backend: 'openai', modelId }));
  return provider;
});

vi.mock('@ai-sdk/google-vertex', () => ({
  createVertex: (opts: unknown) => createVertexSpy(opts as never),
}));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: (opts: unknown) => createGoogleSpy(opts as never),
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (opts: unknown) => createOpenAISpy(opts as never),
}));

// FIX 1 (AIN-8 review) — stub node:fs so the credential-materialization path
// (shared with gemini-client via the exported `ensureVertexCredentials`) is
// observable without touching the real filesystem.
const writeFileSyncSpy = vi.fn();
vi.mock('node:fs', () => ({
  default: { writeFileSync: (...args: unknown[]) => writeFileSyncSpy(...args) },
  writeFileSync: (...args: unknown[]) => writeFileSyncSpy(...args),
}));

import {
  createAiSdkModel,
  AI_SDK_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  OPENAI_DEFAULT_MODEL_ID,
  resolveAiProvider,
  resolveModelId,
} from '../ai-sdk-provider';

const ENV_KEYS = [
  'AI_PROVIDER',
  'AI_MODEL_ID',
  'OPENAI_API_KEY',
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

/** PR 2 — most Google-path tests now opt in explicitly via AI_PROVIDER. */
function useGoogleProvider() {
  process.env.AI_PROVIDER = 'google';
}

afterEach(() => {
  clearEnv();
  createVertexSpy.mockClear();
  createGoogleSpy.mockClear();
  createOpenAISpy.mockClear();
  writeFileSyncSpy.mockClear();
});

describe('AIN-44 #5 — GEMINI_FLASH_MODEL_ID single source of truth', () => {
  it('exposes the canonical Gemini Flash model id', () => {
    expect(GEMINI_FLASH_MODEL_ID).toBe('gemini-2.5-flash');
  });

  it('keeps AI_SDK_MODEL_ID as an alias of GEMINI_FLASH_MODEL_ID', () => {
    expect(AI_SDK_MODEL_ID).toBe(GEMINI_FLASH_MODEL_ID);
  });
});

describe('createAiSdkModel — Google backend selection (AI_PROVIDER=google)', () => {
  it('uses AI Studio when GEMINI_API_KEY is set and Vertex is not forced', () => {
    clearEnv();
    useGoogleProvider();
    process.env.GEMINI_API_KEY = 'test-key';

    const model = createAiSdkModel() as unknown as { __backend: string; modelId: string };

    expect(createGoogleSpy).toHaveBeenCalledTimes(1);
    expect(createVertexSpy).not.toHaveBeenCalled();
    expect(model.__backend).toBe('ai_studio');
    expect(model.modelId).toBe(AI_SDK_MODEL_ID);
  });

  it('uses Vertex when GOOGLE_CLOUD_PROJECT is set and no API key', () => {
    clearEnv();
    useGoogleProvider();
    process.env.GOOGLE_CLOUD_PROJECT = 'cribai-prod';

    const model = createAiSdkModel() as unknown as { __backend: string };

    expect(createVertexSpy).toHaveBeenCalledTimes(1);
    expect(createGoogleSpy).not.toHaveBeenCalled();
    expect(model.__backend).toBe('vertex');
  });

  it('forces Vertex when GOOGLE_GENAI_USE_VERTEXAI=true even with an API key', () => {
    clearEnv();
    useGoogleProvider();
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
    useGoogleProvider();
    process.env.GOOGLE_CLOUD_PROJECT = 'cribai-prod';
    process.env.GOOGLE_CLOUD_LOCATION = 'us-east1';

    createAiSdkModel();

    expect(createVertexSpy).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'cribai-prod', location: 'us-east1' }),
    );
  });

  it('defaults Vertex location to us-central1 when unset', () => {
    clearEnv();
    useGoogleProvider();
    process.env.GOOGLE_CLOUD_PROJECT = 'cribai-prod';

    createAiSdkModel();

    expect(createVertexSpy).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'us-central1' }),
    );
  });

  it('passes apiKey override into the AI Studio factory', () => {
    clearEnv();
    useGoogleProvider();
    createAiSdkModel({ apiKey: 'override-key' });

    expect(createGoogleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'override-key' }),
    );
  });

  it('throws when neither Google backend is configured', () => {
    clearEnv();
    useGoogleProvider();
    expect(() => createAiSdkModel()).toThrow(/not configured/i);
  });
});

describe('PR 2 — provider + model-id resolution', () => {
  it('resolveAiProvider defaults to openai', () => {
    expect(resolveAiProvider({} as NodeJS.ProcessEnv)).toBe('openai');
  });

  it('resolveAiProvider honors AI_PROVIDER=google', () => {
    expect(resolveAiProvider({ AI_PROVIDER: 'google' } as NodeJS.ProcessEnv)).toBe('google');
  });

  it('resolveAiProvider falls back to openai for an unknown value', () => {
    expect(resolveAiProvider({ AI_PROVIDER: 'anthropic' } as NodeJS.ProcessEnv)).toBe('openai');
  });

  it('resolveAiProvider normalizes case + surrounding whitespace for google', () => {
    // Regression: 'Google', ' google ', and a trailing newline must all reach
    // the google path, not silently fall through to openai (which would then
    // surprise the operator with the OPENAI_API_KEY missing-key throw).
    for (const v of ['Google', 'GOOGLE', ' google ', 'google\n']) {
      expect(resolveAiProvider({ AI_PROVIDER: v } as NodeJS.ProcessEnv)).toBe('google');
    }
  });

  it('resolveModelId returns the openai default by default', () => {
    expect(resolveModelId('openai', {} as NodeJS.ProcessEnv)).toBe(OPENAI_DEFAULT_MODEL_ID);
    expect(OPENAI_DEFAULT_MODEL_ID).toBe('gpt-5.4-mini');
  });

  it('resolveModelId returns the gemini default for google', () => {
    expect(resolveModelId('google', {} as NodeJS.ProcessEnv)).toBe(GEMINI_FLASH_MODEL_ID);
  });

  it('resolveModelId honors an AI_MODEL_ID override for either provider', () => {
    expect(resolveModelId('openai', { AI_MODEL_ID: 'gpt-4o' } as NodeJS.ProcessEnv)).toBe('gpt-4o');
    expect(resolveModelId('google', { AI_MODEL_ID: 'gemini-3' } as NodeJS.ProcessEnv)).toBe('gemini-3');
  });
});

describe('createAiSdkModel — OpenAI backend (default provider)', () => {
  it('defaults to OpenAI with the verified model id when OPENAI_API_KEY is set', () => {
    clearEnv();
    process.env.OPENAI_API_KEY = 'sk-test';

    const model = createAiSdkModel() as unknown as { __backend: string; modelId: string };

    expect(createOpenAISpy).toHaveBeenCalledTimes(1);
    expect(createGoogleSpy).not.toHaveBeenCalled();
    expect(createVertexSpy).not.toHaveBeenCalled();
    expect(model.__backend).toBe('openai');
    expect(model.modelId).toBe(OPENAI_DEFAULT_MODEL_ID);
  });

  it('passes OPENAI_API_KEY into createOpenAI', () => {
    clearEnv();
    process.env.OPENAI_API_KEY = 'sk-from-env';

    createAiSdkModel();

    expect(createOpenAISpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-from-env' }),
    );
  });

  it('uses the apiKey option override over OPENAI_API_KEY', () => {
    clearEnv();
    process.env.OPENAI_API_KEY = 'sk-env';

    createAiSdkModel({ apiKey: 'sk-override' });

    expect(createOpenAISpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-override' }),
    );
  });

  it('honors AI_MODEL_ID override on the OpenAI path (gpt-4o fallback)', () => {
    clearEnv();
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.AI_MODEL_ID = 'gpt-4o';

    const model = createAiSdkModel() as unknown as { modelId: string };

    expect(model.modelId).toBe('gpt-4o');
  });

  it('throws a clear error when OPENAI_API_KEY is missing', () => {
    clearEnv();
    // Default provider is openai; no key set.
    expect(() => createAiSdkModel()).toThrow(/OPENAI_API_KEY/);
  });
});

describe('createAiSdkModel — Vertex credential materialization (FIX 1)', () => {
  it('materializes GOOGLE_APPLICATION_CREDENTIALS_JSON to a temp file before creating the Vertex model', () => {
    clearEnv();
    useGoogleProvider();
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
    useGoogleProvider();
    process.env.GOOGLE_CLOUD_PROJECT = 'cribai-prod';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/already/configured.json';
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({ type: 'sa' });

    createAiSdkModel();

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(createVertexSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT materialize credentials on the AI Studio path', () => {
    clearEnv();
    useGoogleProvider();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({ type: 'sa' });

    createAiSdkModel();

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(createGoogleSpy).toHaveBeenCalledTimes(1);
  });
});
