import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatProvider, useChatContext } from '../ChatProvider';
import { fireEvent } from '@testing-library/react';

// Mock the Supabase browser client (used for auth token retrieval)
vi.mock('@campusnest/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  }),
}));

// Helper to create a mock ReadableStream from SSE strings
function makeMockStream(sseChunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of sseChunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Extract text content from a blocks-based message for test assertions */
function extractText(element: HTMLElement): string {
  return element.textContent ?? '';
}

// Test consumer that renders blocks as text for assertion
function TestConsumer() {
  const { messages, loading, sendMessage } = useChatContext();
  return (
    <div>
      <div data-testid="loading">{loading ? 'true' : 'false'}</div>
      <div data-testid="message-count">{messages.length}</div>
      {messages.map((m) => (
        <div key={m.id} data-testid={`msg-${m.role}`} data-role={m.role}>
          {m.blocks
            .filter((b): b is { type: 'text'; content: string } => b.type === 'text')
            .map((b, i) => (
              <span key={i}>{b.content}</span>
            ))}
        </div>
      ))}
      <button onClick={() => sendMessage('test query')}>Send</button>
    </div>
  );
}

describe('ChatProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('provides initial state: empty messages, loading false', () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );
    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('message-count').textContent).toBe('0');
  });

  it('sendMessage appends a user message immediately', async () => {
    const stream = makeMockStream(['data: {"type":"done"}\n\n']);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    const userMessages = screen.getAllByTestId('msg-user');
    expect(extractText(userMessages[0]!)).toBe('test query');
  });

  it('sendMessage POSTs to /api/ai/cribai with correct body', async () => {
    const stream = makeMockStream(['data: {"type":"done"}\n\n']);
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    render(
      <ChatProvider campusSlug="test-campus">
        <TestConsumer />
      </ChatProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/ai/cribai',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"query":"test query"'),
      })
    );
    const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(callBody.campusSlug).toBe('test-campus');
  });

  it('sends empty campusSlug when no prop provided', async () => {
    const stream = makeMockStream(['data: {"type":"done"}\n\n']);
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(callBody.campusSlug).toBe('');
  });

  it('loading is false after stream completes', async () => {
    const stream = makeMockStream(['data: {"type":"done"}\n\n']);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
  });

  it('SSE text events accumulate in assistant message', async () => {
    const stream = makeMockStream([
      'data: {"type":"text","content":"Hel"}\n\n',
      'data: {"type":"text","content":"lo"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    await waitFor(() => {
      const assistantMsgs = screen.getAllByTestId('msg-assistant');
      const lastMsg = assistantMsgs[assistantMsgs.length - 1]!;
      expect(extractText(lastMsg)).toBe('Hello');
    });
  });

  it('SSE error event sets assistant message to error text', async () => {
    const stream = makeMockStream([
      'data: {"type":"error","message":"Something went wrong"}\n\n',
    ]);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    await waitFor(() => {
      const assistantMsgs = screen.getAllByTestId('msg-assistant');
      expect(extractText(assistantMsgs[assistantMsgs.length - 1]!)).toBe('Something went wrong');
    });
  });

  it('fetch network error appends error message as assistant message', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    await waitFor(() => {
      const assistantMsgs = screen.getAllByTestId('msg-assistant');
      expect(extractText(assistantMsgs[assistantMsgs.length - 1]!)).toBe('Network error');
    });
  });

  it('innermost ChatProvider campusSlug wins over outer empty-slug provider', async () => {
    const stream = makeMockStream(['data: {"type":"done"}\n\n']);
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    render(
      <ChatProvider>
        <ChatProvider campusSlug="uw-madison">
          <TestConsumer />
        </ChatProvider>
      </ChatProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(callBody.campusSlug).toBe('uw-madison');
  });

  it('ignores empty string sendMessage calls', async () => {
    function EmptyConsumer() {
      const { messages, sendMessage } = useChatContext();
      return (
        <div>
          <div data-testid="msg-count">{messages.length}</div>
          <button onClick={() => sendMessage('   ')}>Send Empty</button>
        </div>
      );
    }

    render(
      <ChatProvider>
        <EmptyConsumer />
      </ChatProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Send Empty'));
    });

    expect(screen.getByTestId('msg-count').textContent).toBe('0');
  });

  it('sends conversation history with messages', async () => {
    const stream1 = makeMockStream([
      'data: {"type":"text","content":"First response"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const stream2 = makeMockStream([
      'data: {"type":"text","content":"Second response"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);

    const mockFetch = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, body: stream1 } as Response)
      .mockResolvedValueOnce({ ok: true, body: stream2 } as Response);

    function MultiTurnConsumer() {
      const { messages, sendMessage } = useChatContext();
      return (
        <div>
          <div data-testid="msg-count">{messages.length}</div>
          <button onClick={() => sendMessage('first question')}>Send First</button>
          <button onClick={() => sendMessage('follow up')}>Send Second</button>
        </div>
      );
    }

    render(
      <ChatProvider campusSlug="uw-madison">
        <MultiTurnConsumer />
      </ChatProvider>
    );

    // First message
    await act(async () => {
      fireEvent.click(screen.getByText('Send First'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('msg-count').textContent).toBe('2');
    });

    // Second message — should include history
    await act(async () => {
      fireEvent.click(screen.getByText('Send Second'));
    });

    const secondCallBody = JSON.parse(mockFetch.mock.calls[1]![1]!.body as string);
    // History includes: user (first question) + assistant (First response) + user (follow up)
    // But the current assistant placeholder is excluded, so we get the first 2 + the new user
    expect(secondCallBody.history.length).toBeGreaterThanOrEqual(2);
    expect(secondCallBody.history[0].role).toBe('user');
    expect(secondCallBody.history[0].content).toBe('first question');
  });
});
