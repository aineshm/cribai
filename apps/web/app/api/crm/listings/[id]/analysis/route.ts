/**
 * GET /api/crm/listings/[id]/analysis (AIN-61) — first-save analysis read.
 *
 * Cache-aside with write-through:
 *   1. Return the persisted `analysis` column when present (migration 039).
 *   2. Otherwise run the firstSaveAnalysis core (trueCost / redFlags /
 *      placesSnapshot / steeringQuestion fanout) and persist the result —
 *      but ONLY when no branch came back status:'error', so a transient LLM
 *      or Places failure is never frozen as the permanent cached analysis
 *      (skipped branches are honest/stable and do persist).
 *
 * Persistence lives route-side on purpose: the core and its handlers are
 * owned by the model-driven tool path and stay untouched.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { firstSaveAnalysis, type FirstSaveAnalysis } from '@campusnest/ai';
import { resolveCrmAuth, type CrmAuth } from '../../../_lib/auth';

const idSchema = z.string().uuid();

/** True when every fanout branch settled without a transient error. */
function isPersistable(analysis: FirstSaveAnalysis): boolean {
  const branches = [
    analysis.trueCost,
    analysis.redFlags,
    analysis.placesSnapshot,
    analysis.steeringQuestion,
  ];
  return branches.every((branch) => branch.status !== 'error');
}

/** Write-through best-effort persist; a failure here must not fail the read. */
async function persistAnalysis(
  auth: CrmAuth,
  listingId: string,
  analysis: FirstSaveAnalysis,
): Promise<void> {
  const { error } = await auth.db
    .from('crm_listings')
    .update({ analysis, analyzed_at: new Date().toISOString() })
    .eq('id', listingId)
    .eq('user_id', auth.userId);

  if (error) {
    console.error('[crm/listings/:id/analysis] Write-through failed:', error);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveCrmAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid listing id' }, { status: 400 });
  }
  const listingId = parsedId.data;

  // 1. Ownership check + persisted-analysis read in one query.
  const { data: row, error: readError } = await auth.db
    .from('crm_listings')
    .select('id, analysis')
    .eq('id', listingId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (readError) {
    console.error('[crm/listings/:id/analysis] Read error:', readError);
    return NextResponse.json({ error: 'Failed to load analysis' }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const persisted = (row as { analysis: FirstSaveAnalysis | null }).analysis;
  if (persisted) {
    return NextResponse.json(persisted);
  }

  // 2. Compute fresh + write-through.
  try {
    const analysis = await firstSaveAnalysis(listingId, {
      db: auth.db,
      userId: auth.userId,
      placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
    });

    if (isPersistable(analysis)) {
      await persistAnalysis(auth, listingId, analysis);
    }

    return NextResponse.json(analysis);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Listing not found') {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    console.error('[crm/listings/:id/analysis] Analysis error:', err);
    return NextResponse.json({ error: 'Failed to analyze listing' }, { status: 500 });
  }
}
