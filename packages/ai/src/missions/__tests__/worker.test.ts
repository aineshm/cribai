/**
 * worker.test.ts — Regression guard for AIN-77.
 *
 * The standalone GH Actions worker entry (worker-loop.ts → worker.ts) must
 * populate the mission registry purely by importing worker.ts. Before AIN-77,
 * worker.ts imported the executor directly and never the registration
 * side-effect module, so MISSION_REGISTRY was empty in the worker process and
 * every claimed mission failed silently ("No mission definition registered").
 *
 * This test FAILS if worker.ts ever stops importing './register' — the exact
 * one-line regression that caused the production outage. register.test.ts only
 * proves register.ts works in isolation; this proves the worker is wired to it.
 *
 * The 5 mission modules are mocked to run the real registerMission() side
 * effect without pulling in their heavy transitive deps; worker.ts's own
 * runtime deps are stubbed so importing the module constructs nothing.
 */

import { describe, it, expect, vi } from 'vitest';

// ── Mock the 5 mission modules (register.ts imports these for side effects) ──
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

// ── Stub worker.ts runtime deps so importing the module is side-effect-free ──
vi.mock('@campusnest/supabase/server', () => ({ createSecretClient: vi.fn() }));
vi.mock('../mission-repository', () => ({ claimNextMission: vi.fn() }));
vi.mock('../executor', () => ({ executeMission: vi.fn() }));

// ── Import the module under test — this MUST trigger import './register' ─────
import '../worker';

import { getRegisteredTypes } from '../registry';

describe('worker registry wiring (AIN-77 regression)', () => {
  it('populates the mission registry on import', () => {
    const types = getRegisteredTypes();

    // If worker.ts drops `import './register'`, none of these are registered
    // and the production silent-failure bug returns.
    expect(types).toContain('housing_search');
    expect(types).toContain('tour_outreach');
    expect(types).toContain('listing_deep_dive');
    expect(types).toContain('sublease_post');
    expect(types).toContain('crm_deep_extract');
  });
});
