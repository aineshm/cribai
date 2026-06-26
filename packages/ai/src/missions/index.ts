/**
 * Missions barrel export — public API for the mission executor engine.
 *
 * Re-exports the executor, registry, repository functions, and type
 * definitions for use by API routes and mission implementations.
 */

// Register all mission pipelines via the dedicated side-effect module.
// register.ts holds the authoritative list so both this barrel and the
// standalone worker (worker.ts) share the same registration path.
import './register';

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
