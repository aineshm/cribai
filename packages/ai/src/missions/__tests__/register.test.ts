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
  registerMission({ type: 'housing_search', steps: [] });
  return { HOUSING_SEARCH_STEPS: [] };
});

vi.mock('../tour-outreach-mission', async () => {
  const { registerMission } = await import('../registry');
  registerMission({ type: 'tour_outreach', steps: [] });
  return { tourOutreachDefinition: { type: 'tour_outreach', steps: [] } };
});

vi.mock('../listing-deep-dive/index', async () => {
  const { registerMission } = await import('../registry');
  registerMission({ type: 'listing_deep_dive', steps: [] });
  return { LISTING_DEEP_DIVE_STEPS: [] };
});

vi.mock('../sublease-post/index', async () => {
  const { registerMission } = await import('../registry');
  registerMission({ type: 'sublease_post', steps: [] });
  return { SUBLEASE_POST_STEPS: [] };
});

vi.mock('../crm-deep-extract/index', async () => {
  const { registerMission } = await import('../registry');
  registerMission({ type: 'crm_deep_extract', steps: [] });
  return { CRM_DEEP_EXTRACT_STEPS: [], CrmDeepExtractInput: undefined };
});

// ── Side-effect import under test (RED: module does not exist yet) ────────
import '../register';

import { getRegisteredTypes } from '../registry';

// ── Tests ─────────────────────────────────────────────────────────────────

describe('register', () => {
  // No beforeEach clearRegistry: the mock factories execute once when the
  // module is first imported (static import above), populating the registry
  // before any test body runs.

  it('registers all 5 mission types when imported', () => {
    const types = getRegisteredTypes();

    expect(types).toContain('housing_search');
    expect(types).toContain('tour_outreach');
    expect(types).toContain('listing_deep_dive');
    expect(types).toContain('sublease_post');
    expect(types).toContain('crm_deep_extract');
    expect(types).toHaveLength(5);
  });
});
