/**
 * POST /api/crm/rank (AIN-61) — rank or compare the viewer's saved listings.
 *
 * Thin wrapper over the rankCompare core: deterministic scoring over the
 * user's crm_listings + crm_inferred_profiles rows. No LLM, no external APIs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rankCompare } from '@campusnest/ai';
import { resolveCrmAuth } from '../_lib/auth';

const rankBodySchema = z.object({
  mode: z.enum(['rank', 'compare']),
  listingIds: z.array(z.string().uuid()).min(1).max(50).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await resolveCrmAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = rankBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await rankCompare(
      { mode: parsed.data.mode, listingIds: parsed.data.listingIds },
      { db: auth.db, userId: auth.userId },
    );
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[crm/rank] Rank error:', err);
    return NextResponse.json({ error: 'Failed to rank listings' }, { status: 500 });
  }
}
