import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logTokenUsage } from '../cost-logger';

describe('logTokenUsage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when usageMetadata is undefined', () => {
    expect(logTokenUsage('gemini-2.5-flash', undefined)).toBeNull();
  });

  it('calculates cost for gemini-2.5-flash with input and output tokens', () => {
    const result = logTokenUsage('gemini-2.5-flash', {
      promptTokenCount: 1000,
      candidatesTokenCount: 500,
      totalTokenCount: 1500,
    });

    expect(result).not.toBeNull();
    expect(result!.model).toBe('gemini-2.5-flash');
    expect(result!.inputTokens).toBe(1000);
    expect(result!.outputTokens).toBe(500);
    expect(result!.cachedTokens).toBe(0);

    // Cost: 1000 * 0.15/1M + 500 * 0.60/1M = 0.00015 + 0.0003 = 0.00045
    expect(result!.estimatedCost).toBeCloseTo(0.00045, 8);
  });

  it('accounts for cached tokens at discounted rate', () => {
    const result = logTokenUsage('gemini-2.5-flash', {
      promptTokenCount: 1000,
      candidatesTokenCount: 200,
      cachedContentTokenCount: 800,
    });

    expect(result).not.toBeNull();
    expect(result!.cachedTokens).toBe(800);

    // nonCachedInput = 1000 - 800 = 200
    // Cost: 200 * 0.15/1M + 800 * 0.01875/1M + 200 * 0.60/1M
    //     = 0.00003 + 0.000015 + 0.00012 = 0.000165
    expect(result!.estimatedCost).toBeCloseTo(0.000165, 8);
  });

  it('uses embedding pricing for gemini-embedding-001', () => {
    const result = logTokenUsage('gemini-embedding-001', {
      promptTokenCount: 5000,
      candidatesTokenCount: 0,
    });

    expect(result).not.toBeNull();
    // Cost: 5000 * 0.00015/1K + 0 = 5000 * 0.00000015 = 0.00075
    expect(result!.estimatedCost).toBeCloseTo(0.00075, 8);
  });

  it('falls back to gemini-2.5-flash pricing for unknown model', () => {
    const result = logTokenUsage('unknown-model', {
      promptTokenCount: 1000,
      candidatesTokenCount: 500,
    });

    expect(result).not.toBeNull();
    expect(result!.model).toBe('unknown-model');
    // Same as gemini-2.5-flash pricing
    expect(result!.estimatedCost).toBeCloseTo(0.00045, 8);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown model "unknown-model"')
    );
  });

  it('handles zero tokens', () => {
    const result = logTokenUsage('gemini-2.5-flash', {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.estimatedCost).toBe(0);
  });

  it('handles missing fields in usageMetadata by defaulting to 0', () => {
    const result = logTokenUsage('gemini-2.5-flash', {});

    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(0);
    expect(result!.outputTokens).toBe(0);
    expect(result!.cachedTokens).toBe(0);
    expect(result!.estimatedCost).toBe(0);
  });

  it('logs cost to console', () => {
    logTokenUsage('gemini-2.5-flash', {
      promptTokenCount: 100,
      candidatesTokenCount: 50,
    });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[cost] gemini-2.5-flash')
    );
  });

  it('includes cached count in log when present', () => {
    logTokenUsage('gemini-2.5-flash', {
      promptTokenCount: 100,
      candidatesTokenCount: 50,
      cachedContentTokenCount: 80,
    });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('cached:80')
    );
  });
});
