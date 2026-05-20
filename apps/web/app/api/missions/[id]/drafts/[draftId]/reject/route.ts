/**
 * Draft rejection route — POST /api/missions/[id]/drafts/[draftId]/reject.
 *
 * Marks the HITL draft as rejected and fails the mission. The user
 * would need to create a new mission to retry with different parameters.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSecretClient } from '@campusnest/supabase/server';
import { isDevAuthEnabled } from '../../../../../../../lib/dev-auth';
import { resolveMissionAuth, verifyMissionOwnership } from '../../../../_helpers';

/** POST /api/missions/[id]/drafts/[draftId]/reject — reject a HITL draft. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; draftId: string }> },
) {
  const { id: missionId, draftId } = await params;
  const { userId, supabase, authViaBearerToken } = await resolveMissionAuth(request);

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const mission = await verifyMissionOwnership(supabase, missionId, userId, authViaBearerToken);
  if (!mission) {
    return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
  }

  if (mission.status !== 'waiting_approval') {
    return NextResponse.json(
      { error: 'Mission is not awaiting approval' },
      { status: 409 },
    );
  }

  const writeClient = (isDevAuthEnabled() || authViaBearerToken) ? createSecretClient() as any : supabase;

  // Update draft decision
  const { data: draftData, error: draftError } = await writeClient
    .from('mission_drafts')
    .update({
      user_decision: 'rejected',
      decided_at: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('mission_id', missionId)
    .select();

  if (draftError) {
    console.error('[missions] Draft reject error:', draftError);
    return NextResponse.json({ error: 'Failed to reject draft' }, { status: 500 });
  }

  if (!draftData || draftData.length === 0) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  // Rejection terminates the mission without retrying any queued work
  const { error: statusError } = await writeClient
    .from('missions')
    .update({
      status: 'cancelled',
      leased_until: null,
      last_heartbeat_at: null,
      last_error: 'Draft rejected by user',
    })
    .eq('id', missionId);

  if (statusError) {
    console.error('[missions] Status update error:', statusError);
    return NextResponse.json({ error: 'Failed to update mission status' }, { status: 500 });
  }

  return NextResponse.json({ status: 'rejected' });
}
