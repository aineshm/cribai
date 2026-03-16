'use client';

import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react';
import { createClient } from '@campusnest/supabase/client';
import { Sparkles, Send } from 'lucide-react';
import { ChatBlockRenderer } from './chat/chat-block-renderer';
import type { ChatBlock } from './chat/chat-block-renderer';

interface Message {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly blocks: readonly ChatBlock[];
}

/** Mission proposal received via SSE from the AI route. */
interface MissionProposal {
  readonly intent: string;
  readonly confidence: number;
  readonly extractedFields: Record<string, unknown>;
}

/** Geographic bounds from the map viewport */
interface MapBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

/** Search context extracted from AI tool calls */
interface SearchContextUpdate {
  readonly mapArea?: string;
  readonly budget?: string;
  readonly bedrooms?: string;
  readonly amenities?: readonly string[];
}

interface CribAIChatProps {
  readonly campusSlug: string;
  readonly campusId?: string;
  readonly initialListingId?: string;
  readonly initialAddress?: string;
  readonly inputSeed?: string | null;
  readonly conversationId?: string | null;
  readonly isAuthenticated?: boolean;
  readonly onConversationCreated?: (id: string) => void;
  /** Called when the AI proposes a mission via SSE. */
  readonly onMissionProposal?: (proposal: MissionProposal) => void;
  readonly onInputSeedConsumed?: () => void;
  /** Map viewport bounds to include in search context */
  readonly mapBounds?: MapBounds | null;
  /** Called when user sends a message (for locking map bounds) */
  readonly onMessageSent?: () => void;
  /** Called when AI tool calls reveal search filters */
  readonly onSearchContext?: (ctx: SearchContextUpdate) => void;
  /** Optional CSS class for the outermost container (e.g. `h-full` when rendered inside a Sheet). */
  readonly className?: string;
}

const CHAT_STORAGE_KEY = 'cribai-chat-messages';

function loadSessionMessages(): readonly Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Array<Omit<Message, 'id'> & { id?: string }>;
    return parsed.map(m => ({
      id: m.id ?? crypto.randomUUID(),
      role: m.role,
      blocks: m.blocks.filter(b => b.type !== 'tool_loading'),
    }));
  } catch {
    return [];
  }
}

interface SSEEvent {
  readonly type?: string;
  readonly content?: string;
  readonly name?: string;
  readonly block?: ChatBlock;
  readonly message?: string;
  readonly text?: string;
  readonly error?: string;
  // mission_proposal fields
  readonly intent?: string;
  readonly confidence?: number;
  readonly extractedFields?: Record<string, unknown>;
}

function parseSSEEvent(data: string): SSEEvent | null {
  try {
    return JSON.parse(data) as SSEEvent;
  } catch {
    return null;
  }
}

/** Save a message to the conversation in the database */
async function persistMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  blocks: readonly ChatBlock[],
): Promise<boolean> {
  try {
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, blocks }),
    });
    if (!res.ok) {
      console.warn(`[CribAI] Failed to persist message: ${res.status}`);
      return false;
    }
    return true;
  } catch {
    console.error('[CribAI] Failed to persist message (network error)');
    return false;
  }
}

/** Create a new conversation via API */
async function createConversation(
  campusId: string,
  title: string,
): Promise<string | null> {
  try {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campusId, title }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string };
    return data.id;
  } catch {
    return null;
  }
}

/** Load messages from a conversation */
async function loadConversationMessages(
  conversationId: string,
): Promise<readonly Message[]> {
  try {
    const res = await fetch(`/api/conversations/${conversationId}`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      messages: Array<{ role: 'user' | 'assistant'; blocks: ChatBlock[] }>;
    };
    return data.messages.map(m => ({
      id: crypto.randomUUID(),
      role: m.role,
      blocks: m.blocks.filter(b => b.type !== 'tool_loading'),
    }));
  } catch {
    return [];
  }
}

export function CribAIChat({
  campusSlug,
  campusId,
  initialListingId: _initialListingId,
  initialAddress,
  inputSeed,
  conversationId: externalConversationId,
  isAuthenticated = false,
  onConversationCreated,
  onMissionProposal,
  onInputSeedConsumed,
  mapBounds,
  onMessageSent,
  onSearchContext: _onSearchContext,
  className,
}: CribAIChatProps) {
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    externalConversationId ?? null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());

  // Load messages when auth state or conversation changes.
  // Also aborts any in-flight SSE stream to prevent stale chunks from
  // leaking into the newly selected conversation.
  useEffect(() => {
    let cancelled = false;

    // Abort any active stream so old chunks don't corrupt the new conversation
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);

    // Sync internal conversationId with external prop
    setConversationId(externalConversationId ?? null);

    if (isAuthenticated && externalConversationId) {
      // Load from DB
      setMessages([]); // clear stale content while loading
      loadConversationMessages(externalConversationId).then(msgs => {
        if (!cancelled) setMessages(msgs);
      });
    } else if (isAuthenticated && !externalConversationId) {
      // New authenticated chat — start empty
      setMessages([]);
    } else if (!isAuthenticated) {
      // Fallback to sessionStorage for unauthenticated users
      setMessages(loadSessionMessages());
    }

    return () => { cancelled = true; };
  }, [isAuthenticated, externalConversationId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // Persist messages to sessionStorage for unauthenticated users
  useEffect(() => {
    if (isAuthenticated) return;
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // sessionStorage full or unavailable
    }
  }, [messages, isAuthenticated]);

  useEffect(() => {
    if (!inputSeed) return;

    setInput(inputSeed);
    onInputSeedConsumed?.();
  }, [inputSeed, onInputSeedConsumed]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const sendMessage = useCallback(async (overrideQuery?: string) => {
    const query = (overrideQuery ?? input).trim();
    if (!query || isStreaming) return;

    if (!overrideQuery) setInput('');
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      blocks: [{ type: 'text', content: query }],
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);

    // Create abort controller early so conversation switches can cancel
    // both the conversation creation and the SSE stream.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // For authenticated users: create conversation on first message
    let activeConvId = conversationId;
    if (isAuthenticated && !activeConvId && campusId) {
      const title = query.length > 50 ? `${query.slice(0, 47)}...` : query;
      activeConvId = await createConversation(campusId, title);
      // If aborted during conversation creation (user switched away), bail out
      if (controller.signal.aborted) return;
      if (activeConvId) {
        setConversationId(activeConvId);
        onConversationCreated?.(activeConvId);
      }
    }

    // Persist user message to DB
    if (isAuthenticated && activeConvId) {
      persistMessage(activeConvId, 'user', userMessage.blocks);
    }

    try {
      const history = updatedMessages.slice(-10).map(m => ({
        role: m.role,
        blocks: m.blocks,
      }));

      const { data: { session } } = await supabaseRef.current.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Notify parent that user sent a message (to lock map bounds)
      onMessageSent?.();

      const response = await fetch('/api/ai/cribai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          campusSlug,
          history,
          ...(mapBounds ? { bounds: mapBounds } : {}),
        }),
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

      const assistantId = crypto.randomUUID();
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', blocks: [] }]);

      const updateAssistantMessage = (blocks: readonly ChatBlock[]) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { id: assistantId, role: 'assistant', blocks };
          return updated;
        });
        scrollToBottom();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          const event = parseSSEEvent(data);
          if (!event) continue;

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
            // Show error inline as a text block instead of crashing
            const errorMsg = event.message ?? 'Something went wrong. Please try again.';
            assistantBlocks = [
              ...assistantBlocks,
              { type: 'text', content: `⚠ ${errorMsg}` },
            ];
            updateAssistantMessage(assistantBlocks);
            setIsStreaming(false);
            return;
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

            case 'mission_proposal': {
              if (onMissionProposal) {
                onMissionProposal({
                  intent: event.intent ?? 'unknown',
                  confidence: event.confidence ?? 0,
                  extractedFields: event.extractedFields ?? {},
                });
              }
              break;
            }

            case 'done':
              reader.cancel();
              break;
          }
        }
      }

      // Persist assistant response to DB after streaming completes
      if (isAuthenticated && activeConvId && assistantBlocks.length > 0) {
        const blocksToSave = assistantBlocks.filter(b => b.type !== 'tool_loading');
        persistMessage(activeConvId, 'assistant', blocksToSave);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('[CribAI] Stream error:', err);
      setMessages(prev => [
        ...prev.filter(m => m.blocks.length > 0),
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          blocks: [{ type: 'text', content: 'Sorry, something went wrong. Please try again.' }],
        },
      ]);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, campusSlug, campusId, conversationId, isAuthenticated, onConversationCreated, onMissionProposal, scrollToBottom]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return (
    <div className={className ?? "flex h-[calc(100dvh-220px)] md:h-[600px] flex-col rounded-2xl border border-[var(--surface-200)]/60 bg-white/90 backdrop-blur-sm shadow-[var(--shadow-card-hover)]"}>
      {/* Messages */}
      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-5 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-[var(--surface-400)]">
            <div className="text-center animate-fade-in">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary-50)] to-[var(--primary-100)]">
                <Sparkles className="h-7 w-7 text-[var(--primary-600)]" strokeWidth={1.5} />
              </div>
              <p className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-700)]">Ask AI anything</p>
              <p className="mt-2 text-sm text-[var(--surface-400)]">I can search listings, compare apartments, explain lease terms, and schedule tours.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {[
                  'Find me a 2-bedroom under $1200',
                  'Compare my saved listings',
                  'Explain security deposits',
                  "What's fair rent for a 2BR?",
                ].map((suggestion, i) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage(suggestion)}
                    className="stagger-bounce rounded-full border border-[var(--surface-200)] bg-white px-4 py-2 text-xs text-[var(--surface-600)] shadow-sm hover:border-[var(--primary-400)] hover:text-[var(--primary-700)] hover:bg-[var(--primary-50)] hover:shadow-md transition-all duration-300"
                    style={{ '--stagger-index': i } as CSSProperties}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex animate-slide-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`space-y-2 px-4 py-3 ${
                msg.role === 'user'
                  ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-teal-800 text-white shadow-md'
                  : 'max-w-[85%] lg:max-w-[70%] rounded-2xl rounded-bl-sm bg-gray-100/80 text-gray-800 border border-gray-200/50'
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
      <div className="safe-area-pb border-t border-[var(--surface-200)]/60 p-4 glass rounded-b-2xl">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={initialAddress ? `Ask about ${initialAddress}...` : "Ask about housing, compare apartments, schedule tours..."}
            className="flex-1 rounded-xl border border-[var(--surface-200)] bg-white px-4 py-2.5 text-sm placeholder:text-[var(--surface-400)] focus:border-[var(--primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]/20 transition-all duration-200"
            disabled={isStreaming}
            aria-label="Chat message input"
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            className="rounded-xl bg-[var(--primary-600)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-700)] hover:shadow-lg hover:shadow-[var(--primary-600)]/20 disabled:opacity-50 disabled:shadow-none transition-all duration-300"
            aria-label={isStreaming ? 'Thinking' : 'Send message'}
          >
            {isStreaming ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse" />
                Thinking
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                Send
                <Send className="h-4 w-4" strokeWidth={2} />
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
