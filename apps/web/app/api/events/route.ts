import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { cookies } from 'next/headers';

/**
 * POST /api/events — fire-and-forget analytics event logging.
 * Accepts: { event: string, metadata?: Record<string, unknown> }
 * Auth is optional — unauthenticated events are stored with user_id = null.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, metadata } = body as {
    event?: string;
    metadata?: Record<string, unknown>;
  };

  if (!event || typeof event !== 'string') {
    return NextResponse.json({ error: 'Missing event name' }, { status: 400 });
  }

  // Try to get authenticated user (optional)
  let userId: string | null = null;
  try {
    const cookieStore = await cookies();
    const supabase = createServerComponentClient(cookieStore);
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    // Auth is optional for analytics — proceed without user_id
  }

  // Insert via service-role client (bypasses RLS for unauthenticated events)
  const serviceClient = createSecretClient();
  await serviceClient.from('analytics_events').insert({
    event,
    metadata: metadata ?? {},
    user_id: userId,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
