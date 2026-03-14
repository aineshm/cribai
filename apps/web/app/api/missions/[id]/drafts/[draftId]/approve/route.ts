/**
 * Draft approval route — POST /api/missions/[id]/drafts/[draftId]/approve.
 *
 * Marks the HITL draft as approved, sets the mission back to 'running',
 * and resumes the executor from the saved step index via Next.js `after()`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createSecretClient } from '@campusnest/supabase/server';
import { isDevAuthEnabled } from '../../../../../../../lib/dev-auth';
import { executeMission } from '@campusnest/ai';
import { resolveMissionAuth, verifyMissionOwnership } from '../../../../_helpers';

/** POST /api/missions/[id]/drafts/[draftId]/approve — approve a HITL draft and resume. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; draftId: string }> },
) {
  const { id: missionId, draftId } = await params;
  const { userId, supabase } = await resolveMissionAuth(request);

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const mission = await verifyMissionOwnership(supabase, missionId, userId);
  if (!mission) {
    return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
  }

  if (mission.status !== 'waiting_approval') {
    return NextResponse.json(
      { error: 'Mission is not awaiting approval' },
      { status: 409 },
    );
  }

  const writeClient = isDevAuthEnabled() ? createSecretClient() as any : supabase;

  // Update draft decision
  const { data: draftData, error: draftError } = await writeClient
    .from('mission_drafts')
    .update({
      user_decision: 'approved',
      decided_at: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('mission_id', missionId)
    .select();

  if (draftError) {
    console.error('[missions] Draft approve error:', draftError);
    return NextResponse.json({ error: 'Failed to approve draft' }, { status: 500 });
  }

  if (!draftData || draftData.length === 0) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  // Set mission back to running
  const { error: statusError } = await writeClient
    .from('missions')
    .update({ status: 'running' })
    .eq('id', missionId);

  if (statusError) {
    console.error('[missions] Status update error:', statusError);
    return NextResponse.json({ error: 'Failed to resume mission' }, { status: 500 });
  }

  // Resume executor from the saved step index — picks up where HITL pause left off
  const stepIndex = mission.current_step_index as number;
  after(() => executeMission({ missionId, startFromStep: stepIndex }));

  return NextResponse.json({ status: 'approved' });
}
