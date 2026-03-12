import { NextRequest, NextResponse } from 'next/server';
import { resolveMissionAuth, verifyMissionOwnership, getQueryClient } from '../_helpers';

/** GET /api/missions/[id] — mission detail + logs + current draft. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: missionId } = await params;
  const { userId, supabase } = await resolveMissionAuth();

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const mission = await verifyMissionOwnership(supabase, missionId, userId);
  if (!mission) {
    return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
  }

  const queryClient = getQueryClient(supabase);

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

  return NextResponse.json({
    mission,
    logs: logsResult.data ?? [],
    currentDraft: draftResult.data ?? null,
  });
}
