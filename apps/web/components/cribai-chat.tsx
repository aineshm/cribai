'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createClient } from '@campusnest/supabase/client';
import { ChatBlockRenderer } from './chat/chat-block-renderer';
import type { ChatBlock } from './chat/chat-block-renderer';

interface Message {
  readonly role: 'user' | 'assistant';
  readonly blocks: readonly ChatBlock[];
}

interface CribAIChatProps {
  readonly campusSlug: string;
  readonly initialListingId?: string;
  readonly initialAddress?: string;
}

interface SSEEvent {
  readonly type?: string;
  readonly content?: string;
  readonly name?: string;
  readonly block?: ChatBlock;
  readonly message?: string;
  readonly text?: string;
  readonly error?: string;
}

function parseSSEEvent(data: string): SSEEvent | null {
  try {
    return JSON.parse(data) as SSEEvent;
  } catch {
    return null;
  }
}

export function CribAIChat({ campusSlug, initialListingId, initialAddress }: CribAIChatProps) {
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const sendMessage = useCallback(async (overrideQuery?: string) => {
    const query = (overrideQuery ?? input).trim();
    if (!query || isStreaming) return;

    if (!overrideQuery) setInput('');
    const userMessage: Message = {
      role: 'user',
      blocks: [{ type: 'text', content: query }],
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = updatedMessages.slice(-10).map(m => ({
        role: m.role,
        blocks: m.blocks,
      }));

      // Get session token for authenticated tool calls (saved listings, tours, etc.)
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/ai/cribai', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, campusSlug, history }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json() as { error?: string };
        throw new Error(err.error ?? 'Request failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let assistantBlocks: ChatBlock[] = [];
      let currentTextContent = '';
      let sseBuffer = '';

      setMessages(prev => [...prev, { role: 'assistant', blocks: [] }]);

      const updateAssistantMessage = (blocks: readonly ChatBlock[]) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', blocks };
          return updated;
        });
        scrollToBottom();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          const event = parseSSEEvent(data);
          if (!event) continue;

          // Handle old format: { text: "..." } without type
          if (event.text && !event.type) {
            currentTextContent += event.text;
            const lastBlock = assistantBlocks[assistantBlocks.length - 1];
            if (lastBlock?.type === 'text') {
              assistantBlocks = [
                ...assistantBlocks.slice(0, -1),
                { type: 'text', content: currentTextContent },
              ];
            } else {
              assistantBlocks = [
                ...assistantBlocks,
                { type: 'text', content: currentTextContent },
              ];
            }
            updateAssistantMessage(assistantBlocks);
            continue;
          }

          if (event.type === 'error') {
            throw new Error(event.message ?? 'Stream error');
          }

          switch (event.type) {
            case 'text': {
              currentTextContent += event.content ?? '';
              const lastBlock = assistantBlocks[assistantBlocks.length - 1];
              if (lastBlock?.type === 'text') {
                assistantBlocks = [
                  ...assistantBlocks.slice(0, -1),
                  { type: 'text', content: currentTextContent },
                ];
              } else {
                assistantBlocks = [
                  ...assistantBlocks,
                  { type: 'text', content: currentTextContent },
                ];
              }
              updateAssistantMessage(assistantBlocks);
              break;
            }

            case 'tool_call': {
              currentTextContent = '';
              assistantBlocks = [
                ...assistantBlocks,
                { type: 'tool_loading', toolName: event.name ?? 'unknown' },
              ];
              updateAssistantMessage(assistantBlocks);
              break;
            }

            case 'tool_result': {
              const withoutLoading = assistantBlocks.filter(b => b.type !== 'tool_loading');
              if (event.block) {
                assistantBlocks = [...withoutLoading, event.block];
              } else {
                assistantBlocks = withoutLoading;
              }
              updateAssistantMessage(assistantBlocks);
              break;
            }

            case 'done':
              reader.cancel();
              break;
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('[CribAI] Stream error:', err);
      setMessages(prev => [
        ...prev.filter(m => m.blocks.length > 0),
        {
          role: 'assistant',
          blocks: [{ type: 'text', content: 'Sorry, something went wrong. Please try again.' }],
        },
      ]);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, campusSlug, scrollToBottom]);

  // Auto-send when navigating from a listing detail page
  const hasSentInitial = useRef(false);
  useEffect(() => {
    if (!initialListingId || hasSentInitial.current) return;

    // Delay to avoid StrictMode abort race (mount → cleanup → remount)
    const timer = setTimeout(() => {
      if (hasSentInitial.current) return;
      hasSentInitial.current = true;
      const label = initialAddress ?? initialListingId;
      sendMessage(`Tell me more about the property at ${label} — what's notable about this place?`);
    }, 100);

    return () => clearTimeout(timer);
  }, [initialListingId, initialAddress, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return (
    <div className="flex h-[600px] flex-col rounded-xl border border-[var(--surface-200)] bg-white shadow-[var(--shadow-card)]">
      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-[var(--surface-400)]">
            <div className="text-center animate-fade-in">
              <p className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-600)]">Ask CribAI anything</p>
              <p className="mt-2 text-sm">Try: &quot;Find me a 2-bedroom under $1200&quot;</p>
              <p className="mt-0.5 text-xs text-[var(--surface-300)]">
                I can search listings, compare apartments, explain lease terms, and schedule tours.
              </p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] space-y-2 px-4 py-2.5 ${
                msg.role === 'user'
                  ? 'rounded-2xl rounded-br-sm bg-[var(--primary-600)] text-white'
                  : 'rounded-2xl rounded-bl-sm bg-[var(--surface-100)] text-[var(--surface-800)]'
              }`}
            >
              {msg.blocks.map((block, j) => (
                <ChatBlockRenderer
                  key={j}
                  block={block}
                  campusSlug={campusSlug}
                />
              ))}
              {msg.blocks.length === 0 && (
                <span className="inline-flex items-center gap-1.5 py-1">
                  <span className="pulse-dot" />
                  <span className="pulse-dot" />
                  <span className="pulse-dot" />
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--surface-200)] p-4 bg-[var(--surface-50)] rounded-b-xl">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about housing, compare apartments, schedule tours..."
            className="flex-1 rounded-xl border border-[var(--surface-200)] bg-white px-4 py-2.5 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)] transition-colors"
            disabled={isStreaming}
            aria-label="Chat message input"
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            className="rounded-xl bg-[var(--primary-600)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-700)] disabled:opacity-50 transition-colors"
            aria-label={isStreaming ? 'Thinking' : 'Send message'}
          >
            {isStreaming ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
