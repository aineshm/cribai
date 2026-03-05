'use client';

import { useState, useRef, useCallback } from 'react';
import { ChatBlockRenderer } from './chat/chat-block-renderer';
import type { ChatBlock } from './chat/chat-block-renderer';

interface Message {
  readonly role: 'user' | 'assistant';
  readonly blocks: readonly ChatBlock[];
}

interface CribAIChatProps {
  readonly campusSlug: string;
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

export function CribAIChat({ campusSlug }: CribAIChatProps) {
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const sendMessage = useCallback(async () => {
    const query = input.trim();
    if (!query || isStreaming) return;

    setInput('');
    const userMessage: Message = {
      role: 'user',
      blocks: [{ type: 'text', content: query }],
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = updatedMessages.slice(-10).map(m => ({
        role: m.role,
        blocks: m.blocks,
      }));

      const response = await fetch('/api/ai/cribai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const errorMsg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages(prev => [
        ...prev.filter(m => m.blocks.length > 0),
        {
          role: 'assistant',
          blocks: [{ type: 'text', content: `Sorry, I encountered an error: ${errorMsg}` }],
        },
      ]);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, campusSlug, scrollToBottom]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return (
    <div className="flex h-[600px] flex-col rounded-lg border border-gray-200 bg-white">
      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-lg font-medium">Ask CribAI anything</p>
              <p className="mt-1 text-sm">
                Try: &quot;Find me a 2-bedroom under $1200&quot;
              </p>
              <p className="mt-0.5 text-xs text-gray-300">
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
              className={`max-w-[85%] space-y-2 rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
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
                <p className="text-sm text-gray-400">...</p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about housing, compare apartments, schedule tours..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={isStreaming}
            aria-label="Chat message input"
          />
          <button
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            aria-label={isStreaming ? 'Thinking' : 'Send message'}
          >
            {isStreaming ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
