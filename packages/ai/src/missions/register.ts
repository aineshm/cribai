/**
 * register.ts — Single, auditable list of all mission pipelines.
 *
 * Two registration paths converge here:
 *
 *   1. Importing this module loads all five mission modules (the named
 *      imports below), each of which calls registerMission() at module load.
 *      This populates the registry for source-executed entry points such as
 *      the standalone tsx worker (worker-loop.ts → worker.ts → import './register').
 *
 *   2. ensureMissionsRegistered() registers them EXPLICITLY by value.
 *
 * Why (2) exists — AIN-80: when runMissionQueueOnce / executeMission are pulled
 * through the `@campusnest/ai` barrel into a *bundled* server build (the Next
 * route `POST /api/missions/run-next`), the narrow package.json `sideEffects`
 * array lets the bundler treat the barrel + worker + this module as
 * side-effect-free and ELIDE the bare `import './…'` side effects — leaving
 * MISSION_REGISTRY empty and every mission failing "No mission definition
 * registered". A bare side-effect import is droppable; an exported function that
 * is *called* and *uses* the imported definition objects is not. So every
 * execution entry point (executeMission) calls ensureMissionsRegistered() and is
 * guaranteed a populated registry regardless of how it was bundled.
 */

import { registerMission } from './registry';
import { HOUSING_SEARCH_DEFINITION } from './housing-search/index';
import { tourOutreachDefinition } from './tour-outreach-mission';
import { LISTING_DEEP_DIVE_DEFINITION } from './listing-deep-dive/index';
import { SUBLEASE_POST_DEFINITION } from './sublease-post/index';
import { CRM_DEEP_EXTRACT_DEFINITION } from './crm-deep-extract/index';

/** The authoritative list of every mission definition, by value. */
const ALL_MISSION_DEFINITIONS = [
  HOUSING_SEARCH_DEFINITION,
  tourOutreachDefinition,
  LISTING_DEEP_DIVE_DEFINITION,
  SUBLEASE_POST_DEFINITION,
  CRM_DEEP_EXTRACT_DEFINITION,
] as const;

/**
 * Idempotently register every mission definition.
 *
 * Safe to call on every execution: registerMission() skips types already
 * present, so repeated calls are cheap no-ops. Intentionally has no memoized
 * "already ran" flag — that would desync with clearRegistry() in tests.
 *
 * Tree-shake-proof: this function is called by executeMission and references
 * the imported definition objects, so neither it nor the mission modules can be
 * elided from a bundled build (unlike a bare `import './…'`). See AIN-80.
 */
export function ensureMissionsRegistered(): void {
  for (const definition of ALL_MISSION_DEFINITIONS) {
    registerMission(definition);
  }
}
