/**
 * Missions collection routes — POST (create) and GET (list).
 *
 * POST creates a new mission row and fires the executor asynchronously
 * via Next.js `after()`. GET returns the authenticated user's missions
 * ordered by most recently updated.
 *
 * The POST body accepts either `campusId` (UUID) or `campus_slug` (string).
 * When only `campus_slug` is provided the route resolves the UUID via a
 * campus_configs lookup before inserting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import { executeMission } from '@campusnest/ai';
import { resolveMissionAuth, getQueryClient } from './_helpers';

/** Accept either a UUID campusId or a campus_slug string. */
const createBodySchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1).max(200),
  goal: z.string().min(1).max(1000),
  /** Direct campus UUID — takes precedence over campus_slug. */
  campusId: z.string().uuid().optional(),
  /** Human-readable campus slug — used when campusId is not provided. */
  campus_slug: z.string().min(1).max(100).optional(),
  input: z.record(z.unknown()).optional().default({}),
  listingId: z.string().uuid().optional(),
  idempotencyKey: z.string().max(200).optional(),
}).refine(
  (data) => data.campusId !== undefined || data.campus_slug !== undefined,
  { message: 'Either campusId or campus_slug must be provided' }
);

/**
 * Resolve a campus UUID from a slug.
 * Returns null when no matching row is found.
 */
async function resolveCampusId(
  supabase: ReturnType<typeof import('@campusnest/supabase/server').createServerComponentClient>,
  slug: string,
  authViaBearerToken = false,
): Promise<string | null> {
  const queryClient = getQueryClient(supabase, authViaBearerToken);
  const { data, error } = await queryClient
    .from('campus_configs')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return (data as { id: string }).id;
}

/** POST /api/missions — create a mission and fire the executor. */
export async function POST(request: NextRequest) {
  const { userId, supabase, authViaBearerToken } = await resolveMissionAuth(request);

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { type, title, goal, campusId, campus_slug, input, listingId, idempotencyKey } = parsed.data;

  // Resolve campus UUID — prefer explicit campusId, fall back to slug lookup
  let resolvedCampusId = campusId;
  if (!resolvedCampusId && campus_slug) {
    const lookedUp = await resolveCampusId(supabase, campus_slug, authViaBearerToken);
    if (!lookedUp) {
      return NextResponse.json(
        { error: `Campus not found for slug: ${campus_slug}` },
        { status: 404 },
      );
    }
    resolvedCampusId = lookedUp;
  }

  // Use service-role client when dev mode OR Bearer token auth (cookie client has no session → RLS blocks)
  const writeClient = getQueryClient(supabase, authViaBearerToken);

  // Idempotency check — return existing mission if key already used by this user
  if (idempotencyKey) {
    const { data: existing } = await writeClient
      .from('missions')
      .select('id, status')
      .eq('idempotency_key', idempotencyKey)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ id: existing.id, status: existing.status }, { status: 200 });
    }
  }

  const { data, error } = await writeClient
    .from('missions')
    .insert({
      user_id: userId,
      type,
      title,
      goal,
      campus_id: resolvedCampusId,
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
  after(async () => {
    try {
      await executeMission({ missionId: data.id as string });
    } catch (err) {
      console.error('[missions] executeMission failed for id', data.id, err);
    }
  });

  return NextResponse.json({ id: data.id, status: data.status }, { status: 201 });
}

/** GET /api/missions — list the user's missions. */
export async function GET(request: NextRequest) {
  const { userId, supabase, authViaBearerToken } = await resolveMissionAuth(request);

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const queryClient = getQueryClient(supabase, authViaBearerToken);

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
