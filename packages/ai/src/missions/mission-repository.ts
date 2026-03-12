import type { SupabaseClient } from '@supabase/supabase-js';
import type { Mission, MissionLog, MissionDraft, MissionSteering } from '@campusnest/types';

// ─── Mission CRUD ──────────────────────────────────────────

/** Fetch a mission by ID. Throws if not found. */
export async function getMission(
  supabase: SupabaseClient,
  missionId: string,
): Promise<Mission> {
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .eq('id', missionId)
    .single();

  if (error || !data) {
    throw new Error(`Mission not found: ${missionId}`);
  }

  return data as Mission;
}

/** Update a mission's status. */
export async function updateMissionStatus(
  supabase: SupabaseClient,
  missionId: string,
  status: string,
): Promise<void> {
  const { error } = await supabase
    .from('missions')
    .update({ status })
    .eq('id', missionId);

  if (error) {
    throw new Error(`Failed to update mission status: ${error.message}`);
  }
}

/** Persist accumulated state and step index after a step completes. */
export async function updateMissionState(
  supabase: SupabaseClient,
  missionId: string,
  state: Readonly<Record<string, unknown>>,
  stepIndex: number,
): Promise<void> {
  const { error } = await supabase
    .from('missions')
    .update({ state, current_step_index: stepIndex })
    .eq('id', missionId);

  if (error) {
    throw new Error(`Failed to update mission state: ${error.message}`);
  }
}

/** Set the final result on a completed mission. */
export async function setMissionResult(
  supabase: SupabaseClient,
  missionId: string,
  result: Readonly<Record<string, unknown>>,
): Promise<void> {
  const { error } = await supabase
    .from('missions')
    .update({ result })
    .eq('id', missionId);

  if (error) {
    throw new Error(`Failed to set mission result: ${error.message}`);
  }
}

// ─── Mission Logs ──────────────────────────────────────────

export interface InsertLogParams {
  readonly mission_id: string;
  readonly action: string;
  readonly detail: string;
  readonly status: string;
  readonly tool_name?: string | null;
  readonly tool_input?: Record<string, unknown> | null;
  readonly tool_output?: Record<string, unknown> | null;
}

/** Append a log entry to mission_logs. */
export async function insertMissionLog(
  supabase: SupabaseClient,
  params: InsertLogParams,
): Promise<MissionLog> {
  const { data, error } = await supabase
    .from('mission_logs')
    .insert({
      mission_id: params.mission_id,
      action: params.action,
      detail: params.detail,
      status: params.status,
      tool_name: params.tool_name ?? null,
      tool_input: params.tool_input ?? null,
      tool_output: params.tool_output ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert mission log: ${error?.message ?? 'unknown'}`);
  }

  return data as MissionLog;
}

// ─── Mission Drafts ──────────────────────────────────────────

export interface InsertDraftParams {
  readonly mission_id: string;
  readonly draft_type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Insert a new HITL draft. The DB trigger auto-sets previous drafts as not current. */
export async function insertMissionDraft(
  supabase: SupabaseClient,
  params: InsertDraftParams,
): Promise<MissionDraft> {
  const { data, error } = await supabase
    .from('mission_drafts')
    .insert({
      mission_id: params.mission_id,
      draft_type: params.draft_type,
      payload: params.payload,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert mission draft: ${error?.message ?? 'unknown'}`);
  }

  return data as MissionDraft;
}

/** Fetch a single draft by ID. Throws if not found. */
export async function getMissionDraft(
  supabase: SupabaseClient,
  draftId: string,
): Promise<MissionDraft> {
  const { data, error } = await supabase
    .from('mission_drafts')
    .select('*')
    .eq('id', draftId)
    .single();

  if (error || !data) {
    throw new Error(`Draft not found: ${draftId}`);
  }

  return data as MissionDraft;
}

/** Record the user's decision on a draft. */
export async function updateDraftDecision(
  supabase: SupabaseClient,
  draftId: string,
  decision: string,
): Promise<void> {
  const { error } = await supabase
    .from('mission_drafts')
    .update({
      user_decision: decision,
      decided_at: new Date().toISOString(),
    })
    .eq('id', draftId);

  if (error) {
    throw new Error(`Failed to update draft decision: ${error.message}`);
  }
}

// ─── Mission Steerings ──────────────────────────────────────────

export interface InsertSteeringParams {
  readonly mission_id: string;
  readonly raw_input: string;
  readonly parsed_intent?: Record<string, unknown> | null;
}

/** Insert a steering correction from the user. */
export async function insertMissionSteering(
  supabase: SupabaseClient,
  params: InsertSteeringParams,
): Promise<MissionSteering> {
  const { data, error } = await supabase
    .from('mission_steerings')
    .insert({
      mission_id: params.mission_id,
      raw_input: params.raw_input,
      parsed_intent: params.parsed_intent ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert steering: ${error?.message ?? 'unknown'}`);
  }

  return data as MissionSteering;
}

/** Fetch the most recent unapplied steering for a mission. */
export async function getLatestSteering(
  supabase: SupabaseClient,
  missionId: string,
): Promise<MissionSteering | null> {
  const { data, error } = await supabase
    .from('mission_steerings')
    .select('*')
    .eq('mission_id', missionId)
    .is('applied_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch steering: ${error.message}`);
  }

  return (data as MissionSteering | null) ?? null;
}

// ─── Campus Lookup ──────────────────────────────────────────

/** Resolve campus slug from campus ID. Returns 'unknown' if not found. */
export async function getCampusSlug(
  supabase: SupabaseClient,
  campusId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('campus_configs')
    .select('slug')
    .eq('id', campusId)
    .single();

  if (error || !data) {
    return 'unknown';
  }

  return (data as { slug: string }).slug;
}
