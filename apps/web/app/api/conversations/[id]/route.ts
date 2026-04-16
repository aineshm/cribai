import { NextResponse } from 'next/server';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { normalizeConversationState } from '@campusnest/types';
import { isDevAuthEnabled, getDevUserById, DEFAULT_DEV_USER, DEV_USER_COOKIE } from '../../../../lib/dev-auth';
import { cookies } from 'next/headers';

/** GET /api/conversations/[id] — load single conversation with all messages */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieStore = await cookies();
  let userId: string;

  if (isDevAuthEnabled()) {
    const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
    const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
    userId = devUser?.id ?? DEFAULT_DEV_USER.id;
  } else {
    const supabase = createServerComponentClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    userId = user.id;
  }

  // Service-role client in dev mode (dev user UUID not in auth.users, RLS would block)
  const queryClient = isDevAuthEnabled() ? createSecretClient() : createServerComponentClient(cookieStore);

  // RLS ensures only the owner can read their conversation (prod); service-role bypasses in dev
  const { data: conversation, error: convError } = await queryClient
    .from('conversations')
    .select('id, title, last_message_preview, conversation_state, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const { data: messagesData, error: msgError } = await queryClient
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
      conversationState: normalizeConversationState(conversation.conversation_state),
      createdAt: conversation.created_at as string,
      updatedAt: conversation.updated_at as string,
    },
    messages,
  });
}
