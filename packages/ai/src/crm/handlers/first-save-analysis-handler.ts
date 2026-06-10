/**
 * first-save-analysis-handler — CRM tool handler adapter (AIN-15, Track C Phase 1).
 *
 * Validates args, checks sign-in, calls the `firstSaveAnalysis` core, then
 * formats the FanoutBranch struct into a ToolResult.
 *
 * Only status:'ok' branches are surfaced in the user-facing clientBlock.
 * status:'skipped' and status:'error' branches are noted tersely in modelContext
 * only (for LLM awareness) but are omitted from the user message.
 *
 * Does NOT register into tool-registry.ts (Phase 2).
 */

import type { ToolContext, ToolResult } from '../../tools/types';
import { firstSaveAnalysis } from '../first-save-analysis';
import { firstSaveAnalysisInput } from '../schemas';
import type { FirstSaveAnalysis, FanoutBranch } from '../types';
import type { TrueCost } from '../types';
import type { RedFlagResult, PlacesSnapshot, SteeringQuestion } from '../types';
import type { FirstSaveAnalysisMachineData } from './types';

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

function formatTrueCost(branch: FanoutBranch<TrueCost>): string | null {
  if (branch.status !== 'ok') return null;
  const { data } = branch;
  // FIX 5: addons = total - rent so the math is honest.
  // The old "(rent $X + utilities ~$Y)" label was misleading because the total
  // also includes parking, internet, laundry, renterInsurance, and moveInFees.
  const addons = Math.round(data.total - data.rent);
  return `True cost: ~$${data.total}/mo all-in — rent $${data.rent} + ~$${addons} in utilities, parking, internet & fees`;
}

function formatRedFlags(branch: FanoutBranch<RedFlagResult>): string | null {
  if (branch.status !== 'ok') return null;
  const { data } = branch;
  if (data.flags.length === 0) return `Red flags: None. ${data.summary}`;
  return `Red flags: ${data.flags.join(', ')}. ${data.summary}`;
}

function formatPlaces(branch: FanoutBranch<PlacesSnapshot>): string | null {
  if (branch.status !== 'ok') return null;
  const cats = branch.data.categories;
  const entries = Object.entries(cats);
  if (entries.length === 0) return null;
  const summary = entries
    .map(([cat, names]) => `${cat}: ${(names as string[]).slice(0, 3).join(', ')}`)
    .join('; ');
  return `Nearby: ${summary}`;
}

function formatSteering(branch: FanoutBranch<SteeringQuestion>): string | null {
  if (branch.status !== 'ok') return null;
  return branch.data.question;
}

function buildModelContext(analysis: FirstSaveAnalysis): string {
  const parts: string[] = [`Analysis for listing ${analysis.listingId}:`];

  const trueCostStr = formatTrueCost(analysis.trueCost);
  if (trueCostStr) parts.push(trueCostStr);
  else parts.push(`True cost: ${analysis.trueCost.status === 'skipped' ? 'skipped (no rent)' : `error — ${(analysis.trueCost as { error: string }).error}`}`);

  const redFlagsStr = formatRedFlags(analysis.redFlags);
  if (redFlagsStr) parts.push(redFlagsStr);
  else if (analysis.redFlags.status === 'error') parts.push(`Red flags: error — ${(analysis.redFlags as { error: string }).error}`);

  const placesStr = formatPlaces(analysis.placesSnapshot);
  if (placesStr) parts.push(placesStr);

  const steeringStr = formatSteering(analysis.steeringQuestion);
  if (steeringStr) parts.push(`Steering: ${steeringStr}`);

  parts.push('', 'INSTRUCTIONS: Share the true cost and red flags with the user. Ask the steering question.');
  return parts.join('\n');
}

function buildClientContent(analysis: FirstSaveAnalysis): string {
  const lines: string[] = ['**Listing Analysis**', ''];

  const trueCostStr = formatTrueCost(analysis.trueCost);
  if (trueCostStr) lines.push(trueCostStr);

  const redFlagsStr = formatRedFlags(analysis.redFlags);
  if (redFlagsStr) lines.push(redFlagsStr);

  const placesStr = formatPlaces(analysis.placesSnapshot);
  if (placesStr) lines.push(placesStr);

  const steeringStr = formatSteering(analysis.steeringQuestion);
  if (steeringStr) {
    lines.push('', steeringStr);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Error sanitization (security M1)
// ---------------------------------------------------------------------------

/**
 * Branch `error` strings carry raw exception text (AI SDK provider details,
 * PostgREST messages). machineData ships the full fanout to the browser and
 * modelContext embeds branch errors for the LLM — neither may carry raw
 * internals. Map to a stable code; log the raw string server-side.
 */
const GENERIC_BRANCH_ERROR = 'analysis_failed';

function sanitizeBranch<T>(
  listingId: string,
  name: string,
  branch: FanoutBranch<T>,
): FanoutBranch<T> {
  if (branch.status !== 'error') return branch;
  console.error(
    `[first_save_analysis] ${name} branch failed for listing ${listingId}: ${branch.error}`,
  );
  return { status: 'error', error: GENERIC_BRANCH_ERROR };
}

function sanitizeAnalysis(analysis: FirstSaveAnalysis): FirstSaveAnalysis {
  return {
    ...analysis,
    trueCost: sanitizeBranch(analysis.listingId, 'trueCost', analysis.trueCost),
    redFlags: sanitizeBranch(analysis.listingId, 'redFlags', analysis.redFlags),
    placesSnapshot: sanitizeBranch(analysis.listingId, 'placesSnapshot', analysis.placesSnapshot),
    steeringQuestion: sanitizeBranch(
      analysis.listingId,
      'steeringQuestion',
      analysis.steeringQuestion,
    ),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handler for the `first_save_analysis` CRM tool.
 *
 * @param args    - Raw tool arguments (validated via Zod before use).
 * @param context - ToolContext (supabase, userId, etc.).
 * @returns       A ToolResult — never throws to the runtime.
 */
export async function firstSaveAnalysisHandler(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  // --- Sign-in gate ---
  if (!context.userId) {
    return SIGN_IN_RESULT;
  }

  // --- Input validation ---
  const parsed = firstSaveAnalysisInput.safeParse(args);
  if (!parsed.success) {
    return {
      modelContext: `Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      clientBlock: {
        type: 'text' as const,
        content: "I couldn't run the analysis — the listing ID was invalid.",
      },
    };
  }

  try {
    const analysis = sanitizeAnalysis(
      await firstSaveAnalysis(parsed.data.listing_id, {
        db: context.supabase,
        userId: context.userId,
        placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
      }),
    );

    // AIN-65: FirstSaveAnalysisCard renders the FULL fanout object — including
    // skipped/error branches, which the UI surfaces honestly. The text
    // clientBlock (ok-branches only) stays as the legacy chat fallback.
    const machineData: FirstSaveAnalysisMachineData = {
      kind: 'first_save_analysis',
      analysis,
    };

    return {
      machineData,
      modelContext: buildModelContext(analysis),
      clientBlock: { type: 'text' as const, content: buildClientContent(analysis) },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'Listing not found') {
      return {
        modelContext: 'Listing not found in CRM.',
        clientBlock: {
          type: 'text' as const,
          content: "I couldn't find that listing in your CRM. It may have been removed.",
        },
      };
    }
    // Security L3: raw exception text must not reach the model (it can echo it
    // into user-visible prose). Log server-side, send a stable code.
    console.error(`[first_save_analysis] analysis failed: ${msg}`);
    return {
      modelContext: 'Analysis failed: internal error.',
      clientBlock: {
        type: 'text' as const,
        content: "The analysis couldn't be completed. Please try again.",
      },
    };
  }
}
