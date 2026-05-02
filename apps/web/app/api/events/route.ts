import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

const MAX_METADATA_BYTES = 4096;

const eventBodySchema = z.object({
  event: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.:-]+$/),
  metadata: z.record(z.unknown()).optional().default({}),
}).refine((value) => JSON.stringify(value.metadata).length <= MAX_METADATA_BYTES, {
  message: `metadata must be ${MAX_METADATA_BYTES} bytes or less`,
  path: ['metadata'],
});

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

  const parsed = eventBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid event payload', details: parsed.error.flatten() },
      { status: 400 },
    );
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
  const { error } = await serviceClient.from('analytics_events').insert({
    event: parsed.data.event,
    metadata: parsed.data.metadata,
    user_id: userId,
  });

  if (error) {
    console.error('[events] Analytics insert error:', error);
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
