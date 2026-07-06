/**
 * /api/crm/listings/[id] (AIN-61, AIN-95) — single saved CRM listing.
 *
 * DELETE — archive a saved CRM listing. Soft delete: sets status='archived' so
 * re-saving the same URL later starts a fresh row (the migration 037 dedup
 * lookup excludes archived rows). Scoped to the authed user — a foreign id
 * 404s, never mutates.
 *
 * PATCH — user-renamable listing nickname (AIN-95). Overwrites whatever
 * `generateListingNickname` set in the background (or null) — once a user
 * renames a listing, the background generator never gets another chance to
 * touch it (its own guard is `WHERE nickname IS NULL`).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCrmAuth } from '../../_lib/auth';

const idSchema = z.string().uuid();

const patchBodySchema = z
  .object({
    nickname: z.string().trim().min(1, 'Nickname is required').max(60, 'Nickname must be 60 characters or fewer'),
  })
  .strict();

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

export async function PATCH(
  request: NextRequest,
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsedBody = patchBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 },
    );
  }

  const { data, error } = await auth.db
    .from('crm_listings')
    .update({ nickname: parsedBody.data.nickname })
    .eq('id', parsedId.data)
    .eq('user_id', auth.userId)
    .select('id, nickname');

  if (error) {
    console.error('[crm/listings/:id] Rename error:', error);
    return NextResponse.json({ error: 'Failed to rename listing' }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  return NextResponse.json({ listing: data[0] });
}
