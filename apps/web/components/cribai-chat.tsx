'use client';

import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react';
import { createClient } from '@campusnest/supabase/client';
import { Sparkles } from 'lucide-react';
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
  /** Hidden listing ID injected into the AI query (not shown to user). */
  readonly listingIdSeed?: string | null;
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
  /** Called when AI search returns geocoded results — updates the map with matched listings only */
  readonly onMapListings?: (listings: readonly {
    id: string;
    address: string;
    rentMonthly: number;
    beds: number | null;
    sqft: number | null;
    photoUrl: string | null;
    fairnessScore: number | null;
    latitude: number;
    longitude: number;
  }[]) => void;
  /** Called when the chat is reset/cleared so parent can clean up AI state */
  readonly onChatReset?: () => void;
  /** Optional CSS class for the outermost container (e.g. `h-full` when rendered inside a Sheet). */
  readonly className?: string;
  /** Featured listings to display as mini-cards in the empty state */
  readonly featuredListings?: readonly { id: string; title: string; address: string; price: number; photoUrl: string | null; beds: number | null }[];
  /** When true, suppress inline map blocks in AI responses (e.g. explore page already has a persistent MapPanel). */
  readonly suppressInlineMap?: boolean;
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
  readonly args?: Record<string, unknown>;
  readonly machineData?: Record<string, unknown>;
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
  role: 'user',
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
  listingIdSeed,
  conversationId: externalConversationId,
  isAuthenticated = false,
  onConversationCreated,
  onMissionProposal,
  onInputSeedConsumed,
  mapBounds,
  onMessageSent,
  onSearchContext,
  onMapListings,
  onChatReset,
  className,
  featuredListings,
  suppressInlineMap,
}: CribAIChatProps) {
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    externalConversationId ?? null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const pendingListingIdRef = useRef<string | null>(null);
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
      onChatReset?.();
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
    pendingListingIdRef.current = listingIdSeed ?? null;
    onInputSeedConsumed?.();
  }, [inputSeed, listingIdSeed, onInputSeedConsumed]);

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

      // Consume pending listing ID (hidden from user, sent as structured field)
      const listingId = pendingListingIdRef.current;
      pendingListingIdRef.current = null;

      const response = await fetch('/api/ai/cribai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          campusSlug,
          history,
          ...(mapBounds ? { bounds: mapBounds } : {}),
          ...(listingId ? { listingId } : {}),
          ...(activeConvId ? { conversationId: activeConvId } : {}),
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

              // Extract search context from search_listings tool args
              if (event.name === 'search_listings' && onSearchContext) {
                const normalizedArgs =
                  (event.machineData?.normalizedArgs as Record<string, unknown> | undefined) ??
                  event.args;
                if (!normalizedArgs) {
                  break;
                }

                const budget = normalizedArgs.max_rent
                  ? `Under $${Number(normalizedArgs.max_rent).toLocaleString()}`
                  : normalizedArgs.min_rent
                    ? `From $${Number(normalizedArgs.min_rent).toLocaleString()}`
                    : undefined;
                const bedrooms = normalizedArgs.bedrooms !== undefined
                  ? (normalizedArgs.bedrooms === 0 ? 'Studio' : `${normalizedArgs.bedrooms} bed`)
                  : undefined;
                const amenities = Array.isArray(normalizedArgs.amenities) && normalizedArgs.amenities.length > 0
                  ? (normalizedArgs.amenities as string[])
                  : undefined;
                onSearchContext({ budget, bedrooms, amenities });
              }
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

              // When the search_listings tool returns a map block, push listings to the main MapPanel
              if (event.name === 'search_listings_map' && event.block?.type === 'map' && onMapListings) {
                type RawMapListing = {
                  id: string;
                  address: string;
                  rentMonthly: number;
                  bedrooms: number | null;
                  sqft: number | null;
                  fairnessScore: number | null;
                  photoUrl: string | null;
                  latitude: number | null;
                  longitude: number | null;
                };
                const rawListings = (event.block as { type: 'map'; listings: RawMapListing[] }).listings ?? [];
                const mapListings = rawListings
                  .filter(l => l.latitude != null && l.longitude != null)
                  .map(l => ({
                    id: l.id,
                    address: l.address,
                    rentMonthly: l.rentMonthly,
                    beds: l.bedrooms,
                    sqft: l.sqft,
                    photoUrl: l.photoUrl,
                    fairnessScore: l.fairnessScore,
                    latitude: l.latitude as number,
                    longitude: l.longitude as number,
                  }));
                onMapListings(mapListings);
              }
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

      // Assistant messages are persisted server-side by /api/ai/cribai.
      // Client only persists user messages.
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
  }, [input, isStreaming, messages, campusSlug, campusId, conversationId, isAuthenticated, onConversationCreated, onMissionProposal, onMessageSent, onSearchContext, onMapListings, mapBounds, scrollToBottom]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return (
    <div className={className ?? "flex h-[calc(100dvh-var(--app-chrome-height))] md:h-[600px] flex-col rounded-2xl border border-gray-100/50 bg-white/70 backdrop-blur-[12px] shadow-lg shadow-gray-200/50"}>
      {/* Messages */}
      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-5 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-[var(--surface-500)]">
            <div className="text-center animate-fade-in">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(356,80%,98%)] to-[hsl(356,80%,90%)] shadow-inner">
                <Sparkles className="h-7 w-7 text-[hsl(356,80%,25%)]" strokeWidth={1.5} />
              </div>
              <p className="font-[family-name:var(--font-display)] text-xl font-bold bg-gradient-to-r from-[hsl(356,80%,25%)] to-[hsl(356,80%,18%)] bg-clip-text text-transparent">Ask AI anything</p>
              <p className="mt-2 text-xs font-medium text-gray-400 max-w-sm mx-auto">I can search student subleases, compare apartments, explain lease terms, and schedule tours.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-md mx-auto">
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
                    className="stagger-bounce rounded-full border border-gray-100 bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-500 shadow-sm hover:border-[hsl(356,80%,25%)] hover:text-[hsl(356,80%,25%)] hover:bg-[hsl(356,80%,98%)] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer active:scale-95"
                    style={{ '--stagger-index': i } as CSSProperties}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {featuredListings && featuredListings.length > 0 && (
                <div className="mt-6 w-full max-w-lg mx-auto">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Popular subleases near campus</p>
                  <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 -mx-2 px-2">
                    {featuredListings.map((listing) => (
                      <a
                        key={listing.id}
                        href={`/listing/${listing.id}`}
                        className="group flex-shrink-0 w-44 rounded-xl border border-gray-100 bg-white/80 overflow-hidden shadow-sm hover:shadow-md hover:border-[hsl(356,80%,25%)] transition-all duration-200 cursor-pointer"
                      >
                        {listing.photoUrl ? (
                          <div className="h-24 bg-gray-100 overflow-hidden">
                            <img src={listing.photoUrl} alt={listing.address} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          </div>
                        ) : (
                          <div className="h-24 bg-gradient-to-br from-[hsl(356,80%,98%)] to-[hsl(356,80%,94%)] flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[hsl(356,80%,45%)]"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                          </div>
                        )}
                        <div className="px-3 py-2">
                          <p className="text-xs font-bold text-gray-700 truncate">{listing.address}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs font-extrabold text-[hsl(356,80%,25%)]">${listing.price.toLocaleString()}</span>
                            {listing.beds && <span className="text-[9px] font-bold text-gray-400">{listing.beds} bed</span>}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex animate-slide-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              data-role={msg.role}
              className={`space-y-2 px-4 py-3 ${
                msg.role === 'user'
                  ? 'max-w-[80%] rounded-2xl rounded-br-none bg-gradient-to-br from-[hsl(356,80%,32%)] via-[hsl(356,80%,25%)] to-[hsl(356,80%,18%)] text-white shadow-md shadow-red-900/10 font-medium text-sm tracking-wide'
                  : 'max-w-[85%] lg:max-w-[70%] rounded-2xl rounded-bl-none bg-white/90 text-gray-800 border border-gray-100/50 shadow-sm shadow-gray-100/50 text-sm'
              }`}
            >
              {msg.blocks.map((block, j) => (
                <ChatBlockRenderer
                  key={j}
                  block={block}
                  campusSlug={campusSlug}
                  suppressInlineMap={suppressInlineMap}
                />
              ))}
              {msg.blocks.length === 0 && (
                <span className="inline-flex items-center gap-1.5 py-1">
                  <span className="pulse-dot bg-gray-400" />
                  <span className="pulse-dot bg-gray-400" />
                  <span className="pulse-dot bg-gray-400" />
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="safe-area-pb border-t border-gray-100/50 p-4 bg-white/40 backdrop-blur-[8px] rounded-b-2xl">
        <div className="flex relative items-center">
          <input
            type="text"
            value={input}
            onChange={e => {
              const newValue = e.target.value;
              setInput(newValue);
              // Clear listing context only if user fully clears the input
              if (newValue.trim() === '') {
                pendingListingIdRef.current = null;
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={initialAddress ? `Ask about ${initialAddress}...` : "Ask about housing, compare apartments..."}
            className="w-full rounded-2xl border border-gray-200/80 bg-white/95 pl-4 pr-12 py-3 text-sm placeholder:text-gray-400 focus:border-[hsl(356,80%,25%)] focus:outline-none focus:ring-4 focus:ring-[hsl(356,80%,25%)]/5 transition-all duration-300 shadow-sm"
            disabled={isStreaming}
            aria-label="Chat message input — press Enter to send"
          />
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={!input.trim() || isStreaming}
            className="absolute right-2 size-8 rounded-xl bg-gradient-to-br from-[hsl(356,80%,32%)] to-[hsl(356,80%,18%)] text-white flex items-center justify-center shadow-md disabled:opacity-0 disabled:scale-90 disabled:translate-x-2 transition-all duration-300 hover:brightness-110 active:scale-95"
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="size-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
