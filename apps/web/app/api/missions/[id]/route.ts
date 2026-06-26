/**
 * Mission detail route — GET /api/missions/[id].
 *
 * Returns the full mission object along with its execution logs
 * and the current HITL draft (if any), fetched in parallel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveMissionAuth, verifyMissionOwnership, getQueryClient, redactMissionSecrets } from '../_helpers';

/** GET /api/missions/[id] — mission detail + logs + current draft. */
export async function GET(
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

  const queryClient = getQueryClient(supabase, authViaBearerToken);

  // Fetch logs and current draft in parallel
  const [logsResult, draftResult] = await Promise.all([
    queryClient
      .from('mission_logs')
      .select('*')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true }),
    queryClient
      .from('mission_drafts')
      .select('*')
      .eq('mission_id', missionId)
      .eq('is_current', true)
      .maybeSingle(),
  ]);

  if (logsResult.error) {
    console.error('[missions] Logs fetch error:', logsResult.error);
    return NextResponse.json({ error: 'Failed to load mission logs' }, { status: 500 });
  }

  // AIN-77: strip any secret-named keys from mission.input before echoing to client.
  // Defense-in-depth: Hardening A ensures no secret enters input, but this
  // guarantees the API never leaks a secret-named field even if a future code
  // path writes one.
  return NextResponse.json({
    mission: redactMissionSecrets(mission),
    logs: logsResult.data ?? [],
    currentDraft: draftResult.data ?? null,
  });
}
