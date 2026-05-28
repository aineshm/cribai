/**
 * PDR-004 Track A Days 3-4 — runtime selector tests (AIN-8)
 */

import { describe, expect, it } from 'vitest';
import { selectRuntime, LLM_FIRST_FLAG } from '../runtime-select';

describe('selectRuntime', () => {
  it('defaults to deterministic when the flag is unset', () => {
    expect(selectRuntime({ env: {} })).toBe('deterministic');
  });

  it('returns llm_first only when the flag is exactly "1"', () => {
    expect(selectRuntime({ env: { [LLM_FIRST_FLAG]: '1' } })).toBe('llm_first');
  });

  it('treats any non-"1" value as deterministic (dark by default)', () => {
    expect(selectRuntime({ env: { [LLM_FIRST_FLAG]: 'true' } })).toBe('deterministic');
    expect(selectRuntime({ env: { [LLM_FIRST_FLAG]: '0' } })).toBe('deterministic');
    expect(selectRuntime({ env: { [LLM_FIRST_FLAG]: '' } })).toBe('deterministic');
  });

  it('ignores userId in v1 (bucketing deferred to AIN-10)', () => {
    expect(
      selectRuntime({ env: { [LLM_FIRST_FLAG]: '1' }, userId: 'user-1' }),
    ).toBe('llm_first');
    expect(selectRuntime({ env: {}, userId: 'user-2' })).toBe('deterministic');
  });
});
