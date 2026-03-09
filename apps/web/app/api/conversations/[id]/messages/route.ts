import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

const messageBodySchema = z.object({
  role: z.enum(['user', 'assistant']),
  blocks: z.array(z.record(z.unknown())),
});

/** Extract first text content from blocks for preview, truncated to 100 chars */
function extractPreview(blocks: readonly Record<string, unknown>[]): string | null {
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.content === 'string') {
      const text = block.content.trim();
      return text.length > 100 ? `${text.slice(0, 97)}...` : text;
    }
  }
  return null;
}

/** POST /api/conversations/[id]/messages — save a message to conversation */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rawBody: unknown = await request.json();
  const parsed = messageBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { role, blocks } = parsed.data;

  // Insert message (RLS on messages checks conversation ownership)
  const { data: message, error: insertError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      blocks,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[messages] Insert error:', insertError);
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }

  // Update conversation's updated_at and last_message_preview
  const preview = extractPreview(blocks);
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (preview !== null) {
    updatePayload.last_message_preview = preview;
  }

  await supabase
    .from('conversations')
    .update(updatePayload)
    .eq('id', conversationId);

  return NextResponse.json({ id: message.id }, { status: 201 });
}
