/**
 * CRM tool input schemas (AIN-15, Track C Phase 1).
 *
 * These Zod schemas define the validated input for the 4 Personal CRM tools.
 * In Phase 2 they become the `inputSchema` for each tool registered in
 * `packages/ai/src/runtime/tool-registry.ts`. Do NOT import from tools/* here.
 *
 * `CRM_TOOL_NAMES` and `CrmToolName` are defined here — Phase 2 will reference
 * them. Do NOT merge them into the legacy `ToolName` union in tools/types.ts.
 */

import { z } from 'zod';

/**
 * Shared `show_card` param for the 3 card-emitting CRM tools.
 * Set false to answer in prose only; defaults to true (safe failure mode —
 * a model that omits the field gets current behavior, not a regression).
 */
const showCardParam = z
  .boolean()
  .optional()
  .describe('Render a card for this result. Set false to answer in prose only. Defaults to true.');

// ---------------------------------------------------------------------------
// Tool name registry (Phase 2 forward)
// ---------------------------------------------------------------------------

export const CRM_TOOL_NAMES = [
  'add_listing',
  'first_save_analysis',
  'infer_profile',
  'rank_compare',
] as const;

export type CrmToolName = (typeof CRM_TOOL_NAMES)[number];

// ---------------------------------------------------------------------------
// add_listing
// ---------------------------------------------------------------------------

export const addListingInput = z.object({
  url: z.string().url(),
  show_card: showCardParam,
});

export const ADD_LISTING_DESCRIPTION =
  "Save a listing from any URL the user pastes into their personal CRM, then analyze it.";

// ---------------------------------------------------------------------------
// first_save_analysis
// ---------------------------------------------------------------------------

export const firstSaveAnalysisInput = z.object({
  listing_id: z.string().uuid(),
  show_card: showCardParam,
});

export const FIRST_SAVE_ANALYSIS_DESCRIPTION =
  "Run the wow-moment analysis (true cost, red flags, nearby places, steering question) on a freshly saved CRM listing.";

// ---------------------------------------------------------------------------
// infer_profile
// ---------------------------------------------------------------------------

export const inferProfileInput = z.object({});

export const INFER_PROFILE_DESCRIPTION =
  "Infer a structured housing-preference profile from the user's saved CRM listings and persist it.";

// ---------------------------------------------------------------------------
// rank_compare
// ---------------------------------------------------------------------------

export const rankCompareInput = z.object({
  mode: z.enum(['rank', 'compare']).optional(),
  listing_titles: z.array(z.string()).optional(),
  listing_ids: z.array(z.string().uuid()).optional(),
  show_card: showCardParam,
});

export const RANK_COMPARE_DESCRIPTION =
  "Rank the user's saved CRM listings by weighted score, or produce a side-by-side comparison table.";
