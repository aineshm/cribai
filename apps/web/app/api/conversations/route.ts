import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

const createBodySchema = z.object({
  campusId: z.string().uuid(),
  title: z.string().max(100).optional(),
});

/** GET /api/conversations — list user's conversations (most recent first, limit 20) */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data, error } = await supabase
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
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rawBody: unknown = await request.json();
  const parsed = createBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { campusId, title } = parsed.data;

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
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
