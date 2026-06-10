/**
 * rank-compare-handler — CRM tool handler adapter (AIN-15, Track C Phase 1).
 *
 * Validates args, maps snake_case tool args to camelCase RankCompareArgs,
 * calls the `rankCompare` core, then formats the discriminated result into
 * a ToolResult.
 *
 * Does NOT register into tool-registry.ts (Phase 2).
 */

import type { ToolContext, ToolResult } from '../../tools/types';
import { rankCompare } from '../rank-compare';
import { rankCompareInput } from '../schemas';
import type { RankCompareResult, RankedListing, CompareRow } from '../types';
import type { RankCompareMachineData } from './types';

// ---------------------------------------------------------------------------
// Sign-in gate
// ---------------------------------------------------------------------------

const SIGN_IN_RESULT: ToolResult = {
  modelContext: 'CRM action requires sign-in.',
  clientBlock: { type: 'text' as const, content: 'Please sign in to use your personal CRM.' },
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatRankResult(ranked: readonly RankedListing[]): { modelContext: string; content: string } {
  if (ranked.length === 0) {
    return {
      modelContext: 'No listings to rank.',
      content: "You don't have any saved listings to rank yet.",
    };
  }

  const lines = ranked.map((r, i) => {
    const breakdownStr = Object.entries(r.breakdown)
      .map(([k, v]) => `${k}=${v.toFixed(2)}`)
      .join(', ');
    return `${i + 1}. ${r.title} — score: ${r.score.toFixed(2)} (${breakdownStr})`;
  });

  const modelContext = ['Ranked listings (highest score first):', ...lines, '', 'INSTRUCTIONS: Present this ranked list to the user.'].join('\n');
  const content = ['**Your Listings — Ranked**', '', ...lines].join('\n');

  return { modelContext, content };
}

function formatCompareResult(rows: readonly CompareRow[]): { modelContext: string; content: string } {
  if (rows.length === 0) {
    return {
      modelContext: 'No listings to compare.',
      content: "No matching listings found to compare.",
    };
  }

  const header = ['Listing', 'Rent', 'Beds', 'Baths', 'Sqft', 'Amenities'].join(' | ');
  const separator = '---';

  const dataLines = rows.map((r) => {
    const amenities = r.amenities.length > 0 ? r.amenities.slice(0, 3).join(', ') : '—';
    return [
      r.title || r.listingId,
      r.rent != null ? `$${r.rent}` : '—',
      r.bedrooms != null ? String(r.bedrooms) : '—',
      r.bathrooms != null ? String(r.bathrooms) : '—',
      r.sqft != null ? String(r.sqft) : '—',
      amenities,
    ].join(' | ');
  });

  const modelContext = ['Side-by-side comparison:', header, separator, ...dataLines, '', 'INSTRUCTIONS: Present this comparison table to the user.'].join('\n');
  const content = ['**Listing Comparison**', '', header, separator, ...dataLines].join('\n');

  return { modelContext, content };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handler for the `rank_compare` CRM tool.
 *
 * @param args    - Raw tool arguments (validated via Zod before use).
 * @param context - ToolContext (supabase, userId, etc.).
 * @returns       A ToolResult — never throws to the runtime.
 */
export async function rankCompareHandler(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  // --- Sign-in gate ---
  if (!context.userId) {
    return SIGN_IN_RESULT;
  }

  // --- Input validation ---
  const parsed = rankCompareInput.safeParse(args);
  if (!parsed.success) {
    return {
      modelContext: `Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      clientBlock: {
        type: 'text' as const,
        content: "I couldn't understand those ranking options. Please try again.",
      },
    };
  }

  // --- Map snake_case → camelCase ---
  const coreArgs = {
    mode: parsed.data.mode,
    listingTitles: parsed.data.listing_titles,
    listingIds: parsed.data.listing_ids,
  };

  try {
    const result: RankCompareResult = await rankCompare(coreArgs, {
      db: context.supabase,
      userId: context.userId,
    });

    let formatted: { modelContext: string; content: string };

    if (result.mode === 'rank') {
      formatted = formatRankResult(result.ranked);
    } else {
      formatted = formatCompareResult(result.rows);
    }

    // AIN-65: RankCompareTable renders the raw discriminated result —
    // including empty rank/compare sets (the UI owns the empty state).
    const machineData: RankCompareMachineData = {
      kind: 'rank_compare',
      result,
    };

    return {
      machineData,
      modelContext: formatted.modelContext,
      clientBlock: { type: 'text' as const, content: formatted.content },
    };
  } catch (err: unknown) {
    return {
      modelContext: `Rank/compare failed: ${String(err)}`,
      clientBlock: {
        type: 'text' as const,
        content: "Couldn't rank or compare your listings right now. Please try again.",
      },
    };
  }
}
