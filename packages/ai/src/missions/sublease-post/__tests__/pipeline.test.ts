import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('sublease_post pipeline', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should register with 4 steps', async () => {
    const { clearRegistry, getMissionDefinition } = await import('../../registry');
    clearRegistry();
    await import('../index');
    const def = getMissionDefinition('sublease_post');
    expect(def).toBeDefined();
    expect(def!.steps).toHaveLength(4);
    expect(def!.steps.map(s => s.id)).toEqual([
      'validate_fields',
      'geocode_address',
      'insert_listing',
      'confirm',
    ]);
  });

  it('each step has a label', async () => {
    const { clearRegistry, getMissionDefinition } = await import('../../registry');
    clearRegistry();
    await import('../index');
    const def = getMissionDefinition('sublease_post')!;
    for (const step of def.steps) {
      expect(step.label).toBeTruthy();
    }
  });
});
