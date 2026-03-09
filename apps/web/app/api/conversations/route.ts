import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { isDevAuthEnabled, getDevUserById, DEFAULT_DEV_USER, DEV_USER_COOKIE } from '../../../lib/dev-auth';

const createBodySchema = z.object({
  campusId: z.string().uuid(),
  title: z.string().max(100).optional(),
});

/** Resolve auth — returns userId or null. In dev mode, reads cookie. */
async function resolveUserId(): Promise<{ userId: string | null; supabase: ReturnType<typeof createServerComponentClient> }> {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  if (isDevAuthEnabled()) {
    const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
    const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
    return { userId: devUser?.id ?? DEFAULT_DEV_USER.id, supabase };
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  return { userId: (!error && user) ? user.id : null, supabase };
}

/** GET /api/conversations — list user's conversations (most recent first, limit 20) */
export async function GET() {
  const { userId, supabase } = await resolveUserId();

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // In dev mode, use service-role client to bypass RLS
  const queryClient = isDevAuthEnabled() ? createSecretClient() : supabase;
  const user = { id: userId };

  const { data, error } = await queryClient
    .from('conversations')
    .select('id, title, last_message_preview, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[conversations] List error:', error);
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
  }

  const conversations = (data ?? []).map(row => ({
    id: row.id as string,
    title: row.title as string,
    lastMessagePreview: row.last_message_preview as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));

  return NextResponse.json({ conversations });
}

/** POST /api/conversations — create a new conversation */
export async function POST(request: NextRequest) {
  const { userId, supabase } = await resolveUserId();

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const writeClient = isDevAuthEnabled() ? createSecretClient() : supabase;

  const rawBody: unknown = await request.json();
  const parsed = createBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { campusId, title } = parsed.data;

  const { data, error } = await writeClient
    .from('conversations')
    .insert({
      user_id: userId,
      campus_id: campusId,
      title: title ?? 'New Conversation',
    })
    .select('id, title')
    .single();

  if (error) {
    console.error('[conversations] Create error:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, title: data.title }, { status: 201 });
}
