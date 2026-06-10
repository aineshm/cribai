/**
 * Personal CRM barrel export (AIN-15, Track C Phase 1).
 *
 * Exposes:
 *   - 4 core workflow functions + AddListingError
 *   - 4 tool handler adapters
 *   - Zod schemas, descriptions, CRM_TOOL_NAMES, CrmToolName
 *   - Public types (all shapes external callers need)
 *   - Service client accessor
 *
 * Phase 2: tool-registry.ts will `import { addListingHandler, ... } from './crm'`
 * and wrap each handler in a registry `execute` closure. Do not do that here.
 */

// ---------------------------------------------------------------------------
// Core workflows
// ---------------------------------------------------------------------------

export { addListing, AddListingError } from './add-listing';
export { firstSaveAnalysis } from './first-save-analysis';
export { inferProfile } from './infer-profile';
export { rankCompare } from './rank-compare';

// ---------------------------------------------------------------------------
// Tool handler adapters
// ---------------------------------------------------------------------------

export { addListingHandler } from './handlers/add-listing-handler';
export { firstSaveAnalysisHandler } from './handlers/first-save-analysis-handler';
export { inferProfileHandler } from './handlers/infer-profile-handler';
export { rankCompareHandler } from './handlers/rank-compare-handler';

// ---------------------------------------------------------------------------
// Schemas + descriptions + tool name registry
// ---------------------------------------------------------------------------

export {
  addListingInput,
  ADD_LISTING_DESCRIPTION,
  firstSaveAnalysisInput,
  FIRST_SAVE_ANALYSIS_DESCRIPTION,
  inferProfileInput,
  INFER_PROFILE_DESCRIPTION,
  rankCompareInput,
  RANK_COMPARE_DESCRIPTION,
  CRM_TOOL_NAMES,
} from './schemas';

export type { CrmToolName } from './schemas';

// ---------------------------------------------------------------------------
// Handler machineData contracts (AIN-65)
// ---------------------------------------------------------------------------

export type {
  CrmMachineData,
  AddListingMachineData,
  FirstSaveAnalysisMachineData,
  RankCompareMachineData,
  InferProfileMachineData,
} from './handlers/types';

// ---------------------------------------------------------------------------
// Service client
// ---------------------------------------------------------------------------

export { getCrmServiceClient } from './service-client';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type {
  // addListing
  AddListingDeps,
  AddListingResult,
  AddListingErrorCode,
  // firstSaveAnalysis
  FirstSaveAnalysisDeps,
  FirstSaveAnalysis,
  FanoutBranch,
  RedFlagResult,
  PlacesSnapshot,
  SteeringQuestion,
  // inferProfile
  InferProfileDeps,
  InferProfileResult,
  InferredProfile,
  // rankCompare
  RankCompareDeps,
  RankCompareArgs,
  RankCompareResult,
  RankedListing,
  CompareRow,
  // Shared
  CrmListingRow,
  TrueCostInput,
  ExtractedListing,
  ExtractionErrorCode,
  TrueCost,
  GeocodeResult,
} from './types';
