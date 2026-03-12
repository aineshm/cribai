/**
 * Missions barrel export — public API for the mission executor engine.
 *
 * Re-exports the executor, registry, repository functions, and type
 * definitions for use by API routes and mission implementations.
 */

export { executeMission } from './executor';
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
  updateMissionStatus,
  updateMissionState,
  setMissionResult,
  insertMissionLog,
  insertMissionDraft,
  getMissionDraft,
  updateDraftDecision,
  insertMissionSteering,
  getLatestSteering,
  getCampusSlug,
} from './mission-repository';
export type { InsertLogParams, InsertDraftParams, InsertSteeringParams } from './mission-repository';
