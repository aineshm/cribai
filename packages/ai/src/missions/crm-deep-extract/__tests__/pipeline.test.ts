/**
 * Tests for crm_deep_extract pipeline registration (AIN-71 step 4.7).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('crm_deep_extract pipeline', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should register with 5 steps', async () => {
    const { clearRegistry, getMissionDefinition } = await import('../../registry');
    clearRegistry();
    await import('../index');
    const def = getMissionDefinition('crm_deep_extract');
    expect(def).toBeDefined();
    expect(def!.steps).toHaveLength(5);
    expect(def!.steps.map((s) => s.id)).toEqual([
      'crawl_source',
      'places_lookup',
      'synthesize',
      'update_row',
      'reanalyze',
    ]);
  });

  it('each step has a label', async () => {
    const { clearRegistry, getMissionDefinition } = await import('../../registry');
    clearRegistry();
    await import('../index');
    const def = getMissionDefinition('crm_deep_extract')!;
    for (const step of def.steps) {
      expect(step.label).toBeTruthy();
    }
  });
});
