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
    const analysis = await firstSaveAnalysis(parsed.data.listing_id, {
      db: context.supabase,
      userId: context.userId,
      placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
    });

    return {
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
    return {
      modelContext: `Analysis failed: ${msg}`,
      clientBlock: {
        type: 'text' as const,
        content: "The analysis couldn't be completed. Please try again.",
      },
    };
  }
}
