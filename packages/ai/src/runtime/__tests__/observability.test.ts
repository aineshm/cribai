/**
 * PDR-004 Track A Days 5-6 (AIN-9) — Langfuse bootstrap tests.
 *
 * No network. A fake processor factory + provider registrar are injected so
 * we assert the NO-OP-without-keys contract and the idempotent install without
 * ever constructing a real LangfuseSpanProcessor or OTel provider.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  initLangfuse,
  flushLangfuse,
  isLangfuseConfigured,
  tagCostCapExceeded,
  __resetLangfuseForTests,
  type FlushableSpanProcessor,
  type LangfuseEnv,
} from '../observability';

function fakeProcessor(): FlushableSpanProcessor & { flushed: number } {
  const p = {
    flushed: 0,
    forceFlush: vi.fn(async () => {
      p.flushed += 1;
    }),
    shutdown: vi.fn(async () => {}),
  };
  return p;
}

const KEYS_ENV: LangfuseEnv = {
  LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
  LANGFUSE_SECRET_KEY: 'sk-lf-test',
  LANGFUSE_BASE_URL: 'https://us.cloud.langfuse.com',
};

beforeEach(() => {
  __resetLangfuseForTests();
});

describe('isLangfuseConfigured', () => {
  it('is false when either key is missing', () => {
    expect(isLangfuseConfigured({})).toBe(false);
    expect(isLangfuseConfigured({ LANGFUSE_PUBLIC_KEY: 'pk' })).toBe(false);
    expect(isLangfuseConfigured({ LANGFUSE_SECRET_KEY: 'sk' })).toBe(false);
    expect(isLangfuseConfigured({ LANGFUSE_PUBLIC_KEY: '', LANGFUSE_SECRET_KEY: '' })).toBe(false);
  });

  it('is true when both keys are present', () => {
    expect(isLangfuseConfigured(KEYS_ENV)).toBe(true);
  });
});

describe('initLangfuse — no-op without keys', () => {
  it('installs nothing and returns null when keys are absent', () => {
    const factory = vi.fn();
    const register = vi.fn();
    const result = initLangfuse({ env: {}, processorFactory: factory, registerProvider: register });

    expect(result).toBeNull();
    expect(factory).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('flushLangfuse resolves to a no-op when nothing was installed', async () => {
    initLangfuse({ env: {} });
    await expect(flushLangfuse()).resolves.toBeUndefined();
  });
});

describe('initLangfuse — installs when keys present (injected fakes)', () => {
  it('constructs the processor with the 3 env vars and registers it once', () => {
    const proc = fakeProcessor();
    const factory = vi.fn(() => proc);
    const register = vi.fn();

    const result = initLangfuse({
      env: KEYS_ENV,
      processorFactory: factory,
      registerProvider: register,
    });

    expect(result).toBe(proc);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      baseUrl: 'https://us.cloud.langfuse.com',
    });
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(proc);
  });

  it('is idempotent — a second init does not re-install', () => {
    const factory = vi.fn(() => fakeProcessor());
    const register = vi.fn();

    initLangfuse({ env: KEYS_ENV, processorFactory: factory, registerProvider: register });
    const second = initLangfuse({ env: KEYS_ENV, processorFactory: factory, registerProvider: register });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
    expect(second).not.toBeNull();
  });

  it('flushLangfuse forwards to the installed processor forceFlush', async () => {
    const proc = fakeProcessor();
    initLangfuse({
      env: KEYS_ENV,
      processorFactory: () => proc,
      registerProvider: () => {},
    });

    await flushLangfuse();
    expect(proc.flushed).toBe(1);
  });

  it('tagCostCapExceeded is a no-op (no throw) when nothing is installed', () => {
    initLangfuse({ env: {} });
    expect(() => tagCostCapExceeded({ costUsd: 0.2, capUsd: 0.05 })).not.toThrow();
  });

  it('flushLangfuse swallows a forceFlush rejection (never breaks the response)', async () => {
    const proc: FlushableSpanProcessor = {
      forceFlush: vi.fn(async () => {
        throw new Error('langfuse network down');
      }),
    };
    initLangfuse({
      env: KEYS_ENV,
      processorFactory: () => proc,
      registerProvider: () => {},
    });

    await expect(flushLangfuse()).resolves.toBeUndefined();
  });
});
