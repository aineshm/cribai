/**
 * Mission steering route — POST /api/missions/[id]/steer.
 *
 * Allows the user to submit a natural-language correction while a
 * mission is running. The steering is stored and picked up by the
 * executor on the next step via Gemini function-calling intent parsing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSecretClient } from '@campusnest/supabase/server';
import { isDevAuthEnabled } from '../../../../../lib/dev-auth';
import { resolveMissionAuth, verifyMissionOwnership } from '../../_helpers';

const steerBodySchema = z.object({
  input: z.string().min(1).max(2000),
});

/** POST /api/missions/[id]/steer — submit a steering correction mid-mission. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: missionId } = await params;
  const { userId, supabase, authViaBearerToken } = await resolveMissionAuth(request);

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const mission = await verifyMissionOwnership(supabase, missionId, userId, authViaBearerToken);
  if (!mission) {
    return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = steerBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const writeClient = (isDevAuthEnabled() || authViaBearerToken) ? createSecretClient() as any : supabase;

  const { data, error } = await writeClient
    .from('mission_steerings')
    .insert({
      mission_id: missionId,
      raw_input: parsed.data.input,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[missions] Steering insert error:', error);
    return NextResponse.json({ error: 'Failed to submit steering' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
