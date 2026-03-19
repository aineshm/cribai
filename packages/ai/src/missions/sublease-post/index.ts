import { registerMission } from '../registry';
import type { MissionStep } from '../types';
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

// Side-effect registration — import this module to make sublease_post available.
registerMission({
  type: 'sublease_post',
  steps: SUBLEASE_POST_STEPS,
});
