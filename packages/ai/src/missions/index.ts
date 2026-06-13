/**
 * Missions barrel export — public API for the mission executor engine.
 *
 * Re-exports the executor, registry, repository functions, and type
 * definitions for use by API routes and mission implementations.
 */

// Side-effect imports: register all mission pipelines with the registry.
// These MUST be import statements (not just re-exports) so tree-shaking
// cannot strip them — the registerMission() calls run at import time.
import './housing-search/index';
import './tour-outreach-mission';
import './listing-deep-dive/index';
import './sublease-post/index';
import './crm-deep-extract/index';

export { executeMission } from './executor';
export { runMissionQueueOnce } from './worker';
export { registerMission, getMissionDefinition, getRegisteredTypes, clearRegistry } from './registry';
export type {
  MissionStep,
  StepContext,
  StepResult,
  DraftPayload,
  MissionDefinition,
  ExecuteOptions,
} from './types';
export {
  getMission,
  claimNextMission,
  heartbeatMissionLease,
  clearMissionLease,
  updateMissionStatus,
  updateMissionState,
  updateMissionStepAttempts,
  setMissionResult,
  markMissionRetrying,
  markMissionQueued,
  markMissionFailed,
  markMissionWaitingApproval,
  completeMission,
  insertMissionLog,
  insertMissionDraft,
  getMissionDraft,
  updateDraftDecision,
  insertMissionSteering,
  getLatestSteering,
  getAllUnappliedSteerings,
  markSteeringApplied,
  updateMissionInput,
  getCampusSlug,
} from './mission-repository';
export type { InsertLogParams, InsertDraftParams, InsertSteeringParams } from './mission-repository';
// Named re-exports for direct consumer use (registration already happened via imports above)
export { tourOutreachDefinition } from './tour-outreach-mission';
export { LISTING_DEEP_DIVE_STEPS } from './listing-deep-dive/index';
export { SUBLEASE_POST_STEPS } from './sublease-post/index';
export { HOUSING_SEARCH_STEPS } from './housing-search/index';
export { CRM_DEEP_EXTRACT_STEPS } from './crm-deep-extract/index';
export type { CrmDeepExtractInput } from './crm-deep-extract/index';
export { parseSteeringIntent } from './steering-parser';
export type { SteeringUpdate } from './steering-parser';
