import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('listing_deep_dive pipeline', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should register with 5 steps', async () => {
    const { clearRegistry, getMissionDefinition } = await import('../../registry');
    clearRegistry();
    await import('../index');
    const def = getMissionDefinition('listing_deep_dive');
    expect(def).toBeDefined();
    expect(def!.steps).toHaveLength(5);
    expect(def!.steps.map(s => s.id)).toEqual([
      'fetch_detail',
      'pull_reviews',
      'compare_similar',
      'calculate_true_cost',
      'generate_report',
    ]);
  });

  it('each step has a label', async () => {
    const { clearRegistry, getMissionDefinition } = await import('../../registry');
    clearRegistry();
    await import('../index');
    const def = getMissionDefinition('listing_deep_dive')!;
    for (const step of def.steps) {
      expect(step.label).toBeTruthy();
    }
  });
});
