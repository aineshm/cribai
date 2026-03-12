/**
 * registry.test.ts — Unit tests for the mission registry singleton.
 *
 * Verifies registration, retrieval, duplicate-type enforcement,
 * type listing, and clearRegistry (used between tests to prevent pollution).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerMission,
  getMissionDefinition,
  getRegisteredTypes,
  clearRegistry,
} from '../registry';
import type { MissionDefinition, StepContext, StepResult } from '../types';

/** Creates a minimal no-op step for use in test mission definitions. */
const makeStep = (id: string) => ({
  id,
  label: `Step ${id}`,
  async run(_ctx: StepContext): Promise<StepResult> {
    return { output: {} };
  },
});

const testDefinition: MissionDefinition = {
  type: 'housing_search',
  steps: [makeStep('search'), makeStep('rank')],
};

describe('mission registry', () => {
  // Clear the in-memory registry before each test to ensure isolation
  beforeEach(() => {
    clearRegistry();
  });

  it('registers and retrieves a mission definition', () => {
    registerMission(testDefinition);
    const result = getMissionDefinition('housing_search');
    expect(result).toBeDefined();
    expect(result!.type).toBe('housing_search');
    expect(result!.steps).toHaveLength(2);
  });

  it('returns undefined for unknown type', () => {
    const result = getMissionDefinition('nonexistent');
    expect(result).toBeUndefined();
  });

  it('throws on duplicate registration', () => {
    registerMission(testDefinition);
    expect(() => registerMission(testDefinition)).toThrow(
      "Mission type 'housing_search' is already registered",
    );
  });

  it('lists registered types', () => {
    registerMission(testDefinition);
    registerMission({ type: 'tour_outreach', steps: [makeStep('draft')] });
    const types = getRegisteredTypes();
    expect(types).toContain('housing_search');
    expect(types).toContain('tour_outreach');
    expect(types).toHaveLength(2);
  });

  it('clearRegistry removes all definitions', () => {
    registerMission(testDefinition);
    clearRegistry();
    expect(getMissionDefinition('housing_search')).toBeUndefined();
    expect(getRegisteredTypes()).toHaveLength(0);
  });
});
