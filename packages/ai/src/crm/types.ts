/**
 * Shared CRM type contracts for Track C Personal CRM (PDR-003 / AIN-15).
 *
 * All four CRM workflows (addListing, firstSaveAnalysis, inferProfile,
 * rankCompare) import exclusively from this file for their shared shapes.
 * Types are defined comprehensively here so Tasks 2-6 never need to modify
 * this file.
 *
 * Import graph:
 *   ExtractedListing, ExtractionErrorCode  ← ../extraction
 *   TrueCost                               ← @campusnest/types
 *   TrueCostInput                          ← @campusnest/utils
 *   GeocodeResult                          ← ../tools/lib/geocode-address
 *   SupabaseClient                         ← @supabase/supabase-js
 *   CrmGenerateObject                      ← ./generate (Vercel AI SDK seam)
 */

import type { ExtractedListing, ExtractionErrorCode } from '../extraction';
import type { TrueCost } from '@campusnest/types';
import type { GeocodeResult } from '../tools/lib/geocode-address';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrmGenerateObject } from './generate';

// Re-export the upstream types so consumers import from one place.
export type { ExtractedListing, ExtractionErrorCode, TrueCost, GeocodeResult };
export type { CrmGenerateObject } from './generate';

/**
 * Input shape for calculateTrueCost (@campusnest/utils).
 * Declared locally because @campusnest/utils is not a direct dependency of
 * @campusnest/ai — the AI package uses this shape only for amenitiesToCostFlags
 * return values, which are passed through to the utils function by callers that
 * DO have the dep. The shape is kept in sync with packages/utils/src/cost-calculator.ts.
 */
export interface TrueCostInput {
  readonly rentMonthly: number;
  readonly utilitiesIncluded?: boolean;
  readonly estimatedUtilities?: number;
  readonly campusAvgUtilities?: number;
  readonly parkingIncluded?: boolean;
  readonly estimatedParking?: number;
  readonly campusAvgParking?: number;
  readonly internetIncluded?: boolean;
  readonly estimatedInternet?: number;
  readonly hasInUnitLaundry?: boolean;
  readonly estimatedLaundry?: number;
  readonly renterInsurance?: number;
  readonly moveInFees?: number;
  readonly leaseLengthMonths?: number;
}

// ---------------------------------------------------------------------------
// crm_listings table mirror
// ---------------------------------------------------------------------------

/**
 * A CRM listing row as read back from crm_listings (camelCase mirror;
 * nullable per DB). `coordinates` (PostGIS geography) is intentionally
 * omitted — it round-trips as WKB; downstream code that needs lat/lng
 * selects them explicitly via `ST_Y(coordinates)` / `ST_X(coordinates)`.
 */
export interface CrmListingRow {
  readonly id: string;
  readonly user_id: string;
  readonly source_url: string | null;
  readonly source_site: string | null;
  readonly title: string | null;
  /**
   * User-facing display name (AIN-95). Distinct from `title` (extraction
   * output, often generic/blank). Generated silently in the background after
   * a NEW save; renamable by the user; generation never overwrites an
   * existing value (writes only WHERE nickname IS NULL). Display fallback
   * order everywhere: nickname ?? title ?? address ?? 'Saved listing'.
   */
  readonly nickname: string | null;
  readonly address: string | null;
  readonly rent: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly available_from: string | null;
  readonly description: string | null;
  readonly amenities: readonly string[] | null;  // jsonb array
  readonly photo_urls: readonly string[] | null;  // text[]
  readonly extraction_confidence: number | null;
  readonly status: 'active' | 'archived' | 'declined' | 'applied' | 'toured';
  readonly user_notes: string | null;
  // lat/lng are optional; only present when the select explicitly projects them.
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly saved_at?: string | null;
}

// ---------------------------------------------------------------------------
// Fanout branch discriminant
// ---------------------------------------------------------------------------

/**
 * Discriminated result for each independent firstSaveAnalysis fanout branch.
 * `ok` carries the successful payload; `skipped` means prerequisites weren't
 * met (e.g. no coordinates for a Places lookup); `error` surfaces a caught
 * exception message without rethrowing.
 */
export type FanoutBranch<T> =
  | { readonly status: 'ok'; readonly data: T }
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'error'; readonly error: string };

// ---------------------------------------------------------------------------
// addListing
// ---------------------------------------------------------------------------

/** Dependency bundle injected into the addListing workflow. */
export interface AddListingDeps {
  /** Extraction function — fetches + parses the listing URL. */
  readonly extract: (url: string, opts?: unknown) => Promise<ExtractedListing>;
  /** Optional geocoder; skipped when absent or when listing already has coords. */
  readonly geocode?: (address: string, apiKey: string) => Promise<GeocodeResult | null>;
  /** RLS-bound Supabase client (user_id = auth.uid()). */
  readonly db: SupabaseClient;
  readonly userId: string;
  readonly placesApiKey?: string;
  /** Fire-and-forget hook called after the row is committed. */
  readonly onSaved?: (listingId: string) => void;
  /**
   * Eval side-effect kill-switch (mirrors `ToolContext.dryRun`). When true,
   * `addListing` SKIPS the real extraction fetch AND the `.insert`, returning a
   * synthetic-success `AddListingResult` of the same shape. The handler threads
   * `context.dryRun` here. Live traffic leaves it undefined (default = false).
   */
  readonly dryRun?: boolean;
}

/** Successful result of addListing. */
export interface AddListingResult {
  readonly listingId: string;
  /** True when the URL was already in crm_listings for this user. */
  readonly alreadySaved: boolean;
  /** Numeric confidence (0..1) mapped from extraction_confidence string. */
  readonly confidence: number;
}

/** All error codes addListing can surface (extraction codes + DB). */
export type AddListingErrorCode = ExtractionErrorCode | 'db_error';

// ---------------------------------------------------------------------------
// firstSaveAnalysis
// ---------------------------------------------------------------------------

/** Dependency bundle injected into the firstSaveAnalysis workflow. */
export interface FirstSaveAnalysisDeps {
  readonly db: SupabaseClient;
  readonly userId: string;
  /**
   * Structured-generation seam (Vercel AI SDK `generateObject` wrapper) used by
   * the red-flag scan. Optional so unit tests inject a fake; defaults to
   * `defaultCrmGenerate` (shared provider-neutral factory + Langfuse telemetry).
   */
  readonly generate?: CrmGenerateObject;
  /**
   * Nearby-places lookup function. Signature mirrors the Places API helper
   * used in the rest of the codebase (injectable for testing).
   */
  readonly nearby?: (
    lat: number,
    lon: number,
    radiusMeters: number,
    includedTypes: readonly string[],
    apiKey: string,
    // AIN-90: Google Places API (New) marks `displayName` OPTIONAL — a place
    // can resolve with no name.
  ) => Promise<readonly { displayName?: { text?: string }; types?: readonly string[] }[]>;
  readonly placesApiKey?: string;
  /** Per-branch wall-clock cap in ms; defaults to 1200. */
  readonly perBranchTimeoutMs?: number;
}

/** One or more red flags found in a listing's description / amenities. */
export interface RedFlagResult {
  readonly flags: readonly string[];
  readonly summary: string;
}

/** Bucketed nearby-places snapshot (e.g. { grocery: ['Whole Foods', ...] }). */
export interface PlacesSnapshot {
  readonly categories: Readonly<Record<string, readonly string[]>>;
}

/** A single steering question the agent wants to ask the user after a save. */
export interface SteeringQuestion {
  readonly question: string;
}

/** Aggregate result of all firstSaveAnalysis fanout branches. */
export interface FirstSaveAnalysis {
  readonly listingId: string;
  readonly trueCost: FanoutBranch<TrueCost>;
  readonly redFlags: FanoutBranch<RedFlagResult>;
  readonly placesSnapshot: FanoutBranch<PlacesSnapshot>;
  readonly steeringQuestion: FanoutBranch<SteeringQuestion>;
}

// ---------------------------------------------------------------------------
// inferProfile
// ---------------------------------------------------------------------------

/**
 * The inferred student preference profile, mirroring the
 * crm_inferred_profiles table columns.
 */
export interface InferredProfile {
  readonly rent_min: number | null;
  readonly rent_max: number | null;
  readonly bedrooms_target: number | null;
  readonly must_have_amenities: readonly string[];
  readonly nice_to_have_amenities: readonly string[];
  readonly home_base_address: string | null;
  readonly commute_max_minutes: number | null;
  readonly weights: Readonly<Record<string, number>>;
  readonly confidence: number;
}

/** Dependency bundle injected into the inferProfile workflow. */
export interface InferProfileDeps {
  /** RLS-bound client — SELECT on active crm_listings rows. */
  readonly readDb: SupabaseClient;
  /** Service-role client — upsert into crm_inferred_profiles. */
  readonly writeDb: SupabaseClient;
  readonly userId: string;
  /**
   * Structured-generation seam (Vercel AI SDK `generateObject` wrapper).
   * Optional so unit tests inject a fake; defaults to `defaultCrmGenerate`
   * (shared provider-neutral factory + Langfuse telemetry).
   */
  readonly generate?: CrmGenerateObject;
  /** Minimum number of saved listings required before inference runs. Defaults to 3. */
  readonly minSavesForInference?: number;
  /**
   * Eval side-effect kill-switch (mirrors `ToolContext.dryRun`). When true,
   * `inferProfile` keeps the read + Gemini inference compute but SKIPS the
   * service-role `.upsert` into `crm_inferred_profiles`, still returning the
   * computed `{status:'inferred', profile}`. The handler threads
   * `context.dryRun` here. Live traffic leaves it undefined (default = false).
   */
  readonly dryRun?: boolean;
}

/** Discriminated result of inferProfile. */
export type InferProfileResult =
  | { readonly status: 'inferred'; readonly profile: InferredProfile }
  | { readonly status: 'needs_more_data'; readonly savedCount: number; readonly steeringQuestion: string };

// ---------------------------------------------------------------------------
// rankCompare
// ---------------------------------------------------------------------------

/** Dependency bundle injected into the rankCompare workflow. */
export interface RankCompareDeps {
  /** RLS-bound client. */
  readonly db: SupabaseClient;
  readonly userId: string;
}

/** Arguments that control the rankCompare operation. */
export interface RankCompareArgs {
  readonly mode?: 'rank' | 'compare';
  /** Human-readable listing titles used when listing IDs aren't known. */
  readonly listingTitles?: readonly string[];
  readonly listingIds?: readonly string[];
}

/** A single listing with its computed score and per-dimension breakdown. */
export interface RankedListing {
  readonly listingId: string;
  readonly title: string;
  readonly score: number;
  readonly breakdown: Readonly<Record<string, number>>;
}

/** A single row in a side-by-side comparison table. */
export interface CompareRow {
  readonly listingId: string;
  readonly title: string;
  readonly rent: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[];
}

/** Discriminated result of rankCompare. */
export type RankCompareResult =
  | { readonly mode: 'rank'; readonly ranked: readonly RankedListing[] }
  | { readonly mode: 'compare'; readonly rows: readonly CompareRow[] };
