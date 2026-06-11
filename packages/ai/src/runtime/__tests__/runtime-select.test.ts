/**
 * PDR-004 Track A Days 3-4 — runtime selector tests (AIN-8)
 * AIN-65 / WS6 — surface-scoped CRM escalation matrix.
 */

import { describe, expect, it } from 'vitest';
import { selectRuntime, LLM_FIRST_FLAG, CRM_SURFACE_FLAG } from '../runtime-select';

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

// AIN-65 / WS6 — the CRM surface opts into the LLM-first runtime behind its
// own env kill-switch (CRIBAI_RUNTIME_CRM='1'), independent of the global
// flag. Full surface × env matrix:
describe('selectRuntime — CRM surface escalation (AIN-65)', () => {
  it("returns llm_first for an AUTHENTICATED surface 'crm' turn when CRIBAI_RUNTIME_CRM='1'", () => {
    expect(
      selectRuntime({ env: { [CRM_SURFACE_FLAG]: '1' }, surface: 'crm', userId: 'user-1' }),
    ).toBe('llm_first');
  });

  it('never escalates guests — the rate limiter only covers authenticated users (security HIGH-1)', () => {
    expect(
      selectRuntime({ env: { [CRM_SURFACE_FLAG]: '1' }, surface: 'crm' }),
    ).toBe('deterministic');
    expect(
      selectRuntime({ env: { [CRM_SURFACE_FLAG]: '1' }, surface: 'crm', userId: null }),
    ).toBe('deterministic');
  });

  it("stays deterministic for surface 'crm' when the CRM flag is not exactly '1'", () => {
    expect(selectRuntime({ env: {}, surface: 'crm', userId: 'user-1' })).toBe('deterministic');
    expect(
      selectRuntime({ env: { [CRM_SURFACE_FLAG]: '0' }, surface: 'crm', userId: 'user-1' }),
    ).toBe('deterministic');
    expect(
      selectRuntime({ env: { [CRM_SURFACE_FLAG]: 'true' }, surface: 'crm', userId: 'user-1' }),
    ).toBe('deterministic');
    expect(
      selectRuntime({ env: { [CRM_SURFACE_FLAG]: '' }, surface: 'crm', userId: 'user-1' }),
    ).toBe('deterministic');
  });

  it('the CRM flag alone never escalates non-crm surfaces', () => {
    expect(selectRuntime({ env: { [CRM_SURFACE_FLAG]: '1' }, userId: 'user-1' })).toBe('deterministic');
    expect(
      selectRuntime({ env: { [CRM_SURFACE_FLAG]: '1' }, surface: null, userId: 'user-1' }),
    ).toBe('deterministic');
  });

  it('the global flag still wins regardless of surface (behavior unchanged)', () => {
    expect(
      selectRuntime({ env: { [LLM_FIRST_FLAG]: '1' }, surface: 'crm' }),
    ).toBe('llm_first');
    expect(selectRuntime({ env: { [LLM_FIRST_FLAG]: '1' } })).toBe('llm_first');
    expect(
      selectRuntime({
        env: { [LLM_FIRST_FLAG]: '1', [CRM_SURFACE_FLAG]: '0' },
        surface: 'crm',
      }),
    ).toBe('llm_first');
  });

  it('both flags off is deterministic everywhere', () => {
    expect(selectRuntime({ env: {}, surface: 'crm', userId: 'u-1' })).toBe('deterministic');
    expect(selectRuntime({ env: {} })).toBe('deterministic');
  });
});
