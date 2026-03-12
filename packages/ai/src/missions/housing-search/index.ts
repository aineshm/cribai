import { registerMission } from '../registry';
import type { MissionStep } from '../types';
import { searchListingsStep } from './steps/01-search';
import { deduplicateStep } from './steps/02-deduplicate';
import { researchListingsStep } from './steps/03-research';
import { rankAndScoreStep } from './steps/04-rank';
import { generateReportStep } from './steps/05-report';

export const HOUSING_SEARCH_STEPS: readonly MissionStep[] = [
  searchListingsStep,
  deduplicateStep,
  researchListingsStep,
  rankAndScoreStep,
  generateReportStep,
];

// Side-effect registration — import this module to make housing_search available.
registerMission({
  type: 'housing_search',
  steps: HOUSING_SEARCH_STEPS,
});
