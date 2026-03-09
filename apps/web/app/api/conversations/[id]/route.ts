import { NextResponse } from 'next/server';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { cookies } from 'next/headers';

/** GET /api/conversations/[id] — load single conversation with all messages */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // RLS ensures only the owner can read their conversation
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, title, last_message_preview, created_at, updated_at')
    .eq('id', id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const { data: messagesData, error: msgError } = await supabase
    .from('messages')
    .select('id, conversation_id, role, blocks, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  if (msgError) {
    console.error('[conversations] Messages load error:', msgError);
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
  }

  const messages = (messagesData ?? []).map(row => ({
    id: row.id as string,
    conversationId: row.conversation_id as string,
    role: row.role as 'user' | 'assistant',
    blocks: row.blocks as unknown[],
    createdAt: row.created_at as string,
  }));

  return NextResponse.json({
    conversation: {
      id: conversation.id as string,
      title: conversation.title as string,
      lastMessagePreview: conversation.last_message_preview as string | null,
      createdAt: conversation.created_at as string,
      updatedAt: conversation.updated_at as string,
    },
    messages,
  });
}
