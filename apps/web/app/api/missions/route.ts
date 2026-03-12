/**
 * Missions collection routes — POST (create) and GET (list).
 *
 * POST creates a new mission row and fires the executor asynchronously
 * via Next.js `after()`. GET returns the authenticated user's missions
 * ordered by most recently updated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import { createSecretClient } from '@campusnest/supabase/server';
import { isDevAuthEnabled } from '../../../lib/dev-auth';
import { executeMission } from '@campusnest/ai';
import { resolveMissionAuth, getQueryClient } from './_helpers';

const createBodySchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1).max(200),
  goal: z.string().min(1).max(1000),
  campusId: z.string().uuid(),
  input: z.record(z.unknown()).optional().default({}),
  listingId: z.string().uuid().optional(),
  idempotencyKey: z.string().max(200).optional(),
});

/** POST /api/missions — create a mission and fire the executor. */
export async function POST(request: NextRequest) {
  const { userId, supabase } = await resolveMissionAuth();

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rawBody: unknown = await request.json();
  const parsed = createBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { type, title, goal, campusId, input, listingId, idempotencyKey } = parsed.data;

  // Dev mode bypasses RLS — use service-role client for writes
  const writeClient = isDevAuthEnabled() ? createSecretClient() as any : supabase;

  const { data, error } = await writeClient
    .from('missions')
    .insert({
      user_id: userId,
      type,
      title,
      goal,
      campus_id: campusId,
      input,
      status: 'pending',
      listing_id: listingId ?? null,
      idempotency_key: idempotencyKey ?? null,
    })
    .select('id, status')
    .single();

  if (error) {
    console.error('[missions] Create error:', error);
    return NextResponse.json({ error: 'Failed to create mission' }, { status: 500 });
  }

  // Fire executor asynchronously via Next.js after() — runs post-response
  // so the client gets an immediate 201 while the pipeline runs in background
  after(() => executeMission({ missionId: data.id as string }));

  return NextResponse.json({ id: data.id, status: data.status }, { status: 201 });
}

/** GET /api/missions — list the user's missions. */
export async function GET() {
  const { userId, supabase } = await resolveMissionAuth();

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const queryClient = getQueryClient(supabase);

  const { data, error } = await queryClient
    .from('missions')
    .select('id, type, title, status, goal, current_step_index, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[missions] List error:', error);
    return NextResponse.json({ error: 'Failed to load missions' }, { status: 500 });
  }

  return NextResponse.json({ missions: data ?? [] });
}
