/**
 * CRM tool handler machineData contracts (AIN-65).
 *
 * Each CRM handler emits a typed `machineData` payload on its SUCCESS path so
 * the CRM front end (SavedUnitCard, FirstSaveAnalysisCard, RankCompareTable)
 * can render structured cards from the `tool_result` SSE event without a
 * follow-up query. The plain-text `clientBlock` is unchanged — it remains the
 * fallback renderer for the legacy explore chat.
 *
 * Error / sign-in / invalid-input paths emit NO machineData: the absence of a
 * payload is the front end's signal to fall back to the text block.
 *
 * These are intentionally `type` aliases (not interfaces) so the union stays
 * assignable to `ToolResult`'s default `machineData?: Record<string, unknown>`.
 */

import type {
  AddListingResult,
  CrmListingRow,
  FirstSaveAnalysis,
  InferProfileResult,
  RankCompareResult,
} from '../types';

/**
 * `add_listing` payload. `listing` is the crm_listings row read back after the
 * save (null when the read-back fails or the run is a dry-run — the front end
 * degrades to the text block / a follow-up fetch in that case).
 */
export type AddListingMachineData = {
  readonly kind: 'add_listing';
  readonly result: AddListingResult;
  readonly listing: CrmListingRow | null;
  /** Model-controlled card gate: false = answer in prose, true = render card. */
  readonly show_card: boolean;
};

/**
 * `first_save_analysis` payload — the FULL fanout object including
 * skipped/error branches, which the UI renders honestly.
 */
export type FirstSaveAnalysisMachineData = {
  readonly kind: 'first_save_analysis';
  readonly analysis: FirstSaveAnalysis;
  /** Model-controlled card gate: false = answer in prose, true = render card. */
  readonly show_card: boolean;
};

/** `rank_compare` payload — the discriminated rank/compare result as-is. */
export type RankCompareMachineData = {
  readonly kind: 'rank_compare';
  readonly result: RankCompareResult;
  /** Model-controlled card gate: false = answer in prose, true = render card. */
  readonly show_card: boolean;
};

/**
 * `infer_profile` payload. No front-end card consumes this yet (there is no
 * profile card in the CRM workspace); it is emitted for symmetry and carries
 * the full discriminated result so BOTH the `inferred` profile and the
 * `needs_more_data` steering state are available when a consumer lands.
 */
export type InferProfileMachineData = {
  readonly kind: 'infer_profile';
  readonly result: InferProfileResult;
};

/** Discriminated union of every CRM handler machineData payload. */
export type CrmMachineData =
  | AddListingMachineData
  | FirstSaveAnalysisMachineData
  | RankCompareMachineData
  | InferProfileMachineData;
