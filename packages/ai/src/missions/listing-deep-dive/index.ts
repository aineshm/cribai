import { registerMission } from '../registry';
import type { MissionStep, MissionDefinition } from '../types';
import { fetchDetailStep } from './steps/01-fetch-detail';
import { pullReviewsStep } from './steps/02-pull-reviews';
import { compareSimilarStep } from './steps/03-compare-similar';
import { trueCostStep } from './steps/04-true-cost';
import { generateReportStep } from './steps/05-generate-report';

export const LISTING_DEEP_DIVE_STEPS: readonly MissionStep[] = [
  fetchDetailStep,
  pullReviewsStep,
  compareSimilarStep,
  trueCostStep,
  generateReportStep,
];

export const LISTING_DEEP_DIVE_DEFINITION: MissionDefinition = {
  type: 'listing_deep_dive',
  steps: LISTING_DEEP_DIVE_STEPS,
};

// Side-effect registration — import this module to make listing_deep_dive available.
// AIN-80: also registered explicitly via ensureMissionsRegistered() (tree-shake-proof).
registerMission(LISTING_DEEP_DIVE_DEFINITION);
