import { NextRequest } from 'next/server';
import { createSecretClient } from '@campusnest/supabase/server';
import { CribAI } from '@campusnest/ai';
import type { PageIndexNode } from '@campusnest/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { query, campusSlug, history } = body;

    if (typeof query !== 'string' || typeof campusSlug !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing query or campusSlug' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (query.length > 500) {
      return new Response(JSON.stringify({ error: 'Query too long (max 500 chars)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSecretClient();

    // Fetch campus
    const { data: campus } = await supabase
      .from('campus_configs')
      .select('id, name')
      .eq('slug', campusSlug)
      .single();

    if (!campus) {
      return new Response(JSON.stringify({ error: 'Campus not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch PageIndex tree
    const { data: treeRow } = await supabase
      .from('pageindex_trees')
      .select('tree')
      .eq('campus_id', campus.id)
      .eq('entity_type', 'listings_overview')
      .single();

    const tree: PageIndexNode = treeRow?.tree ?? {
      label: 'root',
      summary: 'No data yet',
      contentRef: null,
      children: [],
    };

    // Parse conversation history (Gemini uses 'model' instead of 'assistant')
    const conversationHistory = Array.isArray(history)
      ? (history as Array<{ role: string; content: string }>)
          .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map(m => ({ role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model', content: m.content }))
      : [];

    const cribai = new CribAI({
      geminiApiKey: geminiKey,
      campusName: campus.name,
    });

    // Stream response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of cribai.chat({ query, tree, conversationHistory })) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
