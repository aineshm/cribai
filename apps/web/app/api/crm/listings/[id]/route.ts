/**
 * DELETE /api/crm/listings/[id] (AIN-61) — archive a saved CRM listing.
 *
 * Soft delete: sets status='archived' so re-saving the same URL later starts a
 * fresh row (the migration 037 dedup lookup excludes archived rows). Scoped to
 * the authed user — a foreign id 404s, never mutates.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCrmAuth } from '../../_lib/auth';

const idSchema = z.string().uuid();

export async function DELETE(
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

  const { data, error } = await auth.db
    .from('crm_listings')
    .update({ status: 'archived' })
    .eq('id', parsedId.data)
    .eq('user_id', auth.userId)
    .select('id');

  if (error) {
    console.error('[crm/listings/:id] Archive error:', error);
    return NextResponse.json({ error: 'Failed to remove listing' }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
