/**
 * reanalyze step for crm_deep_extract mission (AIN-71).
 *
 * Re-runs firstSaveAnalysis after the row has been enriched. Persists
 * analysis+analyzed_at only when no branch errored (same rule as the
 * ingest route's fireAnalysis). Never throws — analysis is enrichment.
 */

import type { MissionStep, StepContext, StepResult } from '../../types';
import { firstSaveAnalysis } from '../../../crm/first-save-analysis';
import type { FirstSaveAnalysis } from '../../../crm/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FirstSaveAnalysisFn = typeof firstSaveAnalysis;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasAnyBranchError(analysis: FirstSaveAnalysis): boolean {
  return [
    analysis.trueCost,
    analysis.redFlags,
    analysis.placesSnapshot,
    analysis.steeringQuestion,
  ].some((branch) => branch.status === 'error');
}

function resolveAnalysisFn(ctx: StepContext): FirstSaveAnalysisFn {
  const injected = (ctx.input as Record<string, unknown>).firstSaveAnalysis;
  if (typeof injected === 'function') return injected as FirstSaveAnalysisFn;
  return firstSaveAnalysis;
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export const reanalyzeStep: MissionStep = {
  id: 'reanalyze',
  label: 'Re-analyzing listing data',

  async run(ctx: StepContext): Promise<StepResult> {
    const listingId = ctx.input.listingId as string;
    const state = ctx.state as Record<string, unknown>;

    const analysisFn = resolveAnalysisFn(ctx);

    let analysis: FirstSaveAnalysis;
    try {
      analysis = await analysisFn(listingId, {
        db: ctx.supabase,
        userId: ctx.userId,
        // AIN-77: key from env only — never from mission input (input is user-readable JSONB).
        placesApiKey: process.env['GOOGLE_PLACES_API_KEY'],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        output: {
          ...state,
          analysisStatus: 'failed',
          analysisError: msg,
        },
      };
    }

    if (hasAnyBranchError(analysis)) {
      return {
        output: {
          ...state,
          analysisStatus: 'skipped_branch_error',
          analysis,
        },
      };
    }

    // Persist analysis + analyzed_at
    try {
      await ctx.supabase
        .from('crm_listings')
        .update({ analysis, analyzed_at: new Date().toISOString() })
        .eq('id', listingId)
        .eq('user_id', ctx.userId);
    } catch {
      // Write failure is not fatal
    }

    return {
      output: {
        ...state,
        analysisStatus: 'persisted',
        analysis,
      },
    };
  },
};
