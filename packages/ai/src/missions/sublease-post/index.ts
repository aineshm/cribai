import { registerMission } from '../registry';
import type { MissionStep, MissionDefinition } from '../types';
import { validateFieldsStep } from './steps/01-validate';
import { geocodeAddressStep } from './steps/02-geocode';
import { insertListingStep } from './steps/03-insert';
import { confirmStep } from './steps/04-confirm';

export const SUBLEASE_POST_STEPS: readonly MissionStep[] = [
  validateFieldsStep,
  geocodeAddressStep,
  insertListingStep,
  confirmStep,
];

export const SUBLEASE_POST_DEFINITION: MissionDefinition = {
  type: 'sublease_post',
  steps: SUBLEASE_POST_STEPS,
};

// Side-effect registration — import this module to make sublease_post available.
// AIN-80: also registered explicitly via ensureMissionsRegistered() (tree-shake-proof).
registerMission(SUBLEASE_POST_DEFINITION);
