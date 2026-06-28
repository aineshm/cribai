/**
 * register.test.ts — Verifies that importing register.ts populates the
 * mission registry with all five mission pipelines.
 *
 * The 5 mission modules are mocked to avoid their heavy transitive
 * dependencies (Supabase, Gemini, Tavily, etc.) while still executing
 * their registerMission() side effects via the real registry module.
 *
 * RED phase: fails with "Cannot find module '../register'" until
 * register.ts is created.
 */

import { describe, it, expect, vi } from 'vitest';

// ── Mock the 5 mission modules ────────────────────────────────────────────
// Each factory calls the REAL registerMission so we verify the registry is
// populated — not that the steps themselves execute.  The registry module
// has zero external dependencies so importing it here is always safe.

vi.mock('../housing-search/index', async () => {
  const { registerMission } = await import('../registry');
  const HOUSING_SEARCH_DEFINITION = { type: 'housing_search', steps: [] };
  registerMission(HOUSING_SEARCH_DEFINITION);
  return { HOUSING_SEARCH_STEPS: [], HOUSING_SEARCH_DEFINITION };
});

vi.mock('../tour-outreach-mission', async () => {
  const { registerMission } = await import('../registry');
  registerMission({ type: 'tour_outreach', steps: [] });
  return { tourOutreachDefinition: { type: 'tour_outreach', steps: [] } };
});

vi.mock('../listing-deep-dive/index', async () => {
  const { registerMission } = await import('../registry');
  const LISTING_DEEP_DIVE_DEFINITION = { type: 'listing_deep_dive', steps: [] };
  registerMission(LISTING_DEEP_DIVE_DEFINITION);
  return { LISTING_DEEP_DIVE_STEPS: [], LISTING_DEEP_DIVE_DEFINITION };
});

vi.mock('../sublease-post/index', async () => {
  const { registerMission } = await import('../registry');
  const SUBLEASE_POST_DEFINITION = { type: 'sublease_post', steps: [] };
  registerMission(SUBLEASE_POST_DEFINITION);
  return { SUBLEASE_POST_STEPS: [], SUBLEASE_POST_DEFINITION };
});

vi.mock('../crm-deep-extract/index', async () => {
  const { registerMission } = await import('../registry');
  const CRM_DEEP_EXTRACT_DEFINITION = { type: 'crm_deep_extract', steps: [] };
  registerMission(CRM_DEEP_EXTRACT_DEFINITION);
  return { CRM_DEEP_EXTRACT_STEPS: [], CRM_DEEP_EXTRACT_DEFINITION, CrmDeepExtractInput: undefined };
});

// ── Module under test ─────────────────────────────────────────────────────
import { ensureMissionsRegistered } from '../register';

import { clearRegistry, getRegisteredTypes } from '../registry';

const ALL_TYPES = [
  'housing_search',
  'tour_outreach',
  'listing_deep_dive',
  'sublease_post',
  'crm_deep_extract',
] as const;

// ── Tests ─────────────────────────────────────────────────────────────────

describe('register', () => {
  // No global beforeEach(clearRegistry): the first test verifies the *import-time*
  // self-registration side effect, which clearRegistry() would erase. The two
  // tests are order-independent regardless — ensureMissionsRegistered() persists
  // its registrations, so whichever runs first leaves all 5 types present.

  it('registers all 5 mission types when the module is imported', () => {
    // The named imports in register.ts load each mission module, whose
    // registerMission() side effect runs on module load (the tsx-worker path).
    const types = getRegisteredTypes();

    for (const type of ALL_TYPES) {
      expect(types).toContain(type);
    }
    expect(types).toHaveLength(5);
  });

  it('ensureMissionsRegistered() repopulates the registry after a clear (AIN-80 tree-shake-proof path)', () => {
    // Simulate the bundled run-next path where the import side effects were
    // tree-shaken away: an empty registry must be restored by the explicit call.
    clearRegistry();
    expect(getRegisteredTypes()).toHaveLength(0);

    ensureMissionsRegistered();

    const types = getRegisteredTypes();
    for (const type of ALL_TYPES) {
      expect(types).toContain(type);
    }
    expect(types).toHaveLength(5);
  });
});
