/**
 * crm_deep_extract mission — definition + registration (AIN-71).
 *
 * System-queued only: enqueued by the ingest route on low-confidence new saves.
 * NOT available from the chat mission launcher or propose-mission tool.
 *
 * Input contract:
 *   { listingId: string; sourceUrl: string }
 *
 * Steps:
 *   1. crawl_source    — fetch + extract landing page + housing subpages
 *   2. places_lookup   — geocode via Google Places (enrichment, never gates)
 *   3. synthesize      — LLM synthesis of all page context
 *   4. update_row      — fill-gaps merge into crm_listings row
 *   5. reanalyze       — re-run firstSaveAnalysis after enrichment
 */

import { registerMission } from '../registry';
import type { MissionStep } from '../types';
import { crawlSourceStep } from './steps/01-crawl-source';
import { placesLookupStep } from './steps/02-places-lookup';
import { synthesizeStep } from './steps/03-synthesize';
import { updateRowStep } from './steps/04-update-row';
import { reanalyzeStep } from './steps/05-reanalyze';

export const CRM_DEEP_EXTRACT_STEPS: readonly MissionStep[] = [
  crawlSourceStep,
  placesLookupStep,
  synthesizeStep,
  updateRowStep,
  reanalyzeStep,
];

export interface CrmDeepExtractInput {
  readonly listingId: string;
  readonly sourceUrl: string;
}

// Side-effect registration — import this module to make crm_deep_extract available.
registerMission({
  type: 'crm_deep_extract',
  steps: CRM_DEEP_EXTRACT_STEPS,
});
