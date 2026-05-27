/**
 * PDR-004 Track A Days 3-4 — explicit prompt-cache key tests (AIN-8)
 *
 * Unit-tests cache-KEY stability + the memo's graceful-degradation contract.
 * Real `caches.create` is deferred to a manual smoke (no live network here).
 */

import { describe, expect, it, vi } from 'vitest';
import { createEmptyConversationState } from '@campusnest/types';
import { buildSystemPrompt, EMPTY_PROFILE_SNIPPET } from '../system-prompt';
import { deriveCacheKey, ExplicitCacheMemo } from '../prompt-cache';

describe('deriveCacheKey', () => {
  it('returns a stable 16-hex-char key for the same prefix', () => {
    const prefix = buildSystemPrompt(
      createEmptyConversationState(),
      EMPTY_PROFILE_SNIPPET,
      { campusName: 'UW-Madison' },
    ).cachedPrefix;

    const k1 = deriveCacheKey(prefix);
    const k2 = deriveCacheKey(prefix);
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs across campuses (campus name is in the cacheable prefix)', () => {
    const uw = buildSystemPrompt(createEmptyConversationState(), EMPTY_PROFILE_SNIPPET, {
      campusName: 'UW-Madison',
    }).cachedPrefix;
    const msu = buildSystemPrompt(createEmptyConversationState(), EMPTY_PROFILE_SNIPPET, {
      campusName: 'Michigan State',
    }).cachedPrefix;

    expect(deriveCacheKey(uw)).not.toBe(deriveCacheKey(msu));
  });

  it('is invariant to the dynamic suffix (only the prefix is keyed)', () => {
    const a = buildSystemPrompt(createEmptyConversationState(), EMPTY_PROFILE_SNIPPET, {
      campusName: 'UW-Madison',
    });
    const withSelection = createEmptyConversationState();
    const b = buildSystemPrompt(
      { ...withSelection, selectedListingId: 'listing-9' },
      { displayName: 'Ainesh', campusSlug: 'uw-madison' },
      { campusName: 'UW-Madison' },
    );
    // Different dynamic suffix, same prefix → same key.
    expect(a.dynamicSuffix).not.toBe(b.dynamicSuffix);
    expect(deriveCacheKey(a.cachedPrefix)).toBe(deriveCacheKey(b.cachedPrefix));
  });
});

describe('ExplicitCacheMemo', () => {
  it('returns null and never calls the creator when disabled', async () => {
    const memo = new ExplicitCacheMemo();
    const create = vi.fn();
    const handle = await memo.resolve('prefix', false, create as never);
    expect(handle).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('memoizes: same prefix only creates once', async () => {
    const memo = new ExplicitCacheMemo();
    const create = vi.fn(async (_p: string, key: string) => ({ key, name: `cache/${key}` }));

    const h1 = await memo.resolve('prefix-A', true, create);
    const h2 = await memo.resolve('prefix-A', true, create);

    expect(create).toHaveBeenCalledTimes(1);
    expect(h1).toEqual(h2);
    expect(memo.size()).toBe(1);
  });

  it('returns null (graceful) when the creator throws — chat must not break', async () => {
    const memo = new ExplicitCacheMemo();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = vi.fn(async () => {
      throw new Error('cache outage');
    });

    const handle = await memo.resolve('prefix-B', true, create as never);
    expect(handle).toBeNull();
    expect(memo.size()).toBe(0);
  });

  it('forget() drops a memoized handle so the next resolve recreates', async () => {
    const memo = new ExplicitCacheMemo();
    const create = vi.fn(async (_p: string, key: string) => ({ key, name: `cache/${key}` }));

    await memo.resolve('prefix-C', true, create);
    memo.forget('prefix-C');
    await memo.resolve('prefix-C', true, create);

    expect(create).toHaveBeenCalledTimes(2);
  });
});
