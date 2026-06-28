import { registerMission } from '../registry';
import type { MissionStep, MissionDefinition } from '../types';
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

export const HOUSING_SEARCH_DEFINITION: MissionDefinition = {
  type: 'housing_search',
  steps: HOUSING_SEARCH_STEPS,
};

// Side-effect registration — import this module to make housing_search available.
// AIN-80: register.ts also registers this explicitly via ensureMissionsRegistered()
// so the registry survives bundler tree-shaking of import side effects.
registerMission(HOUSING_SEARCH_DEFINITION);
