/**
 * useCrmChat REAL mode (AIN-65) — NEXT_PUBLIC_CRM_MOCK='false' wires send()
 * to POST /api/ai/cribai and maps the SSE stream onto ChatMessage kinds.
 *
 * fetch is mocked with hand-built SSE bodies; the Supabase browser client is
 * mocked to return a fixed session (Bearer token + viewer id). The mock chat
 * loop keeps its own spec (useCrmChat.test.tsx) — env flag unset there.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CrmListingRow, FirstSaveAnalysis, RankCompareResult } from '@campusnest/ai';
import { useCrmChat } from '../useCrmChat';

vi.mock('@campusnest/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: { access_token: 'test-token', user: { id: 'viewer-1' } },
        },
      }),
    },
  }),
}));

const ROW: CrmListingRow = {
  id: 'b7e8f3a0-1111-4222-8333-444455556666',
  user_id: 'viewer-1',
  source_url: 'https://www.zillow.com/x',
  source_site: 'zillow',
  title: 'Dayton Row · 2BR',
  address: '523 W Dayton St',
  rent: 1650,
  bedrooms: 2,
  bathrooms: 1,
  sqft: 880,
  available_from: '2026-08-15',
  description: 'desc',
  amenities: ['Dishwasher'],
  photo_urls: ['http://insecure.example/a.jpg', 'https://cdn.example/b.jpg'],
  extraction_confidence: 0.9,
  status: 'active',
  user_notes: null,
};

const ANALYSIS: FirstSaveAnalysis = {
  listingId: ROW.id,
  trueCost: { status: 'skipped', reason: 'no rent' },
  redFlags: { status: 'ok', data: { flags: [], summary: 'No red flags.' } },
  placesSnapshot: { status: 'skipped', reason: 'no coordinates' },
  steeringQuestion: { status: 'ok', data: { question: 'Parking or no parking?' } },
};

const RANK: RankCompareResult = {
  mode: 'rank',
  ranked: [{ listingId: ROW.id, title: 'Dayton Row', score: 82, breakdown: { rent: 0.8 } }],
};

const encoder = new TextEncoder();

function sseResponse(events: readonly unknown[]): Response {
  const payload =
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

function mockFetchOnce(response: Response): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CRM_MOCK', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('useCrmChat — real runtime wiring', () => {
  it('POSTs the CRM surface request with Bearer auth and no conversationId', async () => {
    const fetchMock = mockFetchOnce(sseResponse([{ type: 'text', content: 'Hello' }]));
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('hello');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai/cribai');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.query).toBe('hello');
    expect(body.campusSlug).toBe('uw-madison');
    expect(body.surface).toBe('crm');
    expect(body.history).toEqual([]);
    expect(body).not.toHaveProperty('conversationId');
  });

  it('accumulates text deltas into a single streamed assistant bubble', async () => {
    mockFetchOnce(
      sseResponse([
        { type: 'text', content: 'Here are ' },
        { type: 'text', content: 'your options.' },
        { type: 'done' },
      ]),
    );
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('what do you think?');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    const assistantTexts = result.current.messages.filter(
      (m) => m.kind === 'text' && m.role === 'assistant',
    );
    expect(assistantTexts).toHaveLength(1);
    expect(assistantTexts[0]).toMatchObject({ text: 'Here are your options.' });
  });

  it('maps a paste-URL turn: add_listing → saved-unit card, first_save_analysis → analysis + steering', async () => {
    mockFetchOnce(
      sseResponse([
        { type: 'tool_call', name: 'add_listing', args: { source_url: ROW.source_url } },
        {
          type: 'tool_result',
          name: 'add_listing',
          block: { type: 'text', content: 'Saved!' },
          machineData: {
            kind: 'add_listing',
            result: { listingId: ROW.id, alreadySaved: false, confidence: 0.9 },
            listing: ROW,
          },
        },
        { type: 'tool_call', name: 'first_save_analysis', args: { listing_id: ROW.id } },
        {
          type: 'tool_result',
          name: 'first_save_analysis',
          block: { type: 'text', content: 'Analysis complete.' },
          machineData: { kind: 'first_save_analysis', analysis: ANALYSIS },
        },
        { type: 'text', content: 'Saved and analyzed.' },
        { type: 'done' },
      ]),
    );
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('https://www.zillow.com/x');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    const kinds = result.current.messages.map((m) => m.kind);
    expect(kinds).toEqual(['text', 'saved-unit', 'analysis', 'steering', 'text']);

    const saved = result.current.messages.find((m) => m.kind === 'saved-unit');
    if (saved?.kind !== 'saved-unit') throw new Error('saved-unit message missing');
    expect(saved.unit.id).toBe(ROW.id);
    // AIN-65 fold-in — only https photos survive the adapter.
    expect(saved.unit.photo_urls).toEqual(['https://cdn.example/b.jpg']);

    const steering = result.current.messages.find((m) => m.kind === 'steering');
    expect(steering).toMatchObject({ text: 'Parking or no parking?' });
  });

  it('maps rank_compare machineData onto a rank card', async () => {
    mockFetchOnce(
      sseResponse([
        {
          type: 'tool_result',
          name: 'rank_compare',
          block: { type: 'text', content: 'Ranked.' },
          machineData: { kind: 'rank_compare', result: RANK },
        },
        { type: 'done' },
      ]),
    );
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('rank my places');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    const rank = result.current.messages.find((m) => m.kind === 'rank');
    expect(rank).toMatchObject({ result: RANK });
  });

  it('renders tool_result without machineData as plain text (sign-in gate path)', async () => {
    mockFetchOnce(
      sseResponse([
        {
          type: 'tool_result',
          name: 'add_listing',
          block: { type: 'text', content: 'Sign in to save listings.' },
        },
        { type: 'done' },
      ]),
    );
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('https://www.zillow.com/x');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(
      result.current.messages.some(
        (m) => m.kind === 'text' && m.role === 'assistant' && m.text === 'Sign in to save listings.',
      ),
    ).toBe(true);
  });

  it('exposes the in-flight tool name while a tool call streams', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    mockFetchOnce({ ok: true, status: 200, body } as unknown as Response);
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('https://www.zillow.com/x');
    });

    act(() => {
      controller.enqueue(
        encoder.encode('data: {"type":"tool_call","name":"add_listing","args":{}}\n\n'),
      );
    });
    await waitFor(() => expect(result.current.pendingTool).toBe('add_listing'));

    act(() => {
      controller.enqueue(
        encoder.encode(
          'data: {"type":"tool_result","name":"add_listing","block":{"type":"text","content":"Saved!"}}\n\n',
        ),
      );
      controller.close();
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.pendingTool).toBeNull();
  });

  it('renders SSE error events as an inline error bubble', async () => {
    mockFetchOnce(
      sseResponse([{ type: 'error', message: 'AI service had a hiccup. Try again.' }]),
    );
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('hello');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(
      result.current.messages.some(
        (m) => m.kind === 'text' && m.role === 'assistant' && m.text.includes('hiccup'),
      ),
    ).toBe(true);
  });

  it('renders a non-2xx response as an inline error bubble with the server message', async () => {
    const fn = vi.fn(async () =>
      ({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit exceeded. Please try again later.' }),
      }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fn);
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('hello');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(
      result.current.messages.some(
        (m) => m.kind === 'text' && m.role === 'assistant' && m.text.includes('Rate limit'),
      ),
    ).toBe(true);
  });

  it('renders a thrown network error as an inline error bubble', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('network down'))));
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('hello');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(
      result.current.messages.some((m) => m.kind === 'text' && m.role === 'assistant'),
    ).toBe(true);
  });

  it('ignores mission events on the CRM surface (v1)', async () => {
    mockFetchOnce(
      sseResponse([
        { type: 'mission_proposal', intent: 'housing_search', confidence: 1, extractedFields: {} },
        { type: 'mission_created', missionId: 'm-1' },
        { type: 'text', content: 'Done.' },
        { type: 'done' },
      ]),
    );
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('find me housing');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    // Only the user echo + the assistant text bubble — no mission artifacts.
    expect(result.current.messages.map((m) => m.kind)).toEqual(['text', 'text']);
  });

  it('sends the prior thread, text-projected, as history on follow-up turns', async () => {
    const first = sseResponse([{ type: 'text', content: 'Answer one.' }, { type: 'done' }]);
    const second = sseResponse([{ type: 'text', content: 'Answer two.' }, { type: 'done' }]);
    const fn = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    vi.stubGlobal('fetch', fn);
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('first question');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    act(() => {
      result.current.send('second question');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    const body = JSON.parse(
      (fn.mock.calls[1]! as unknown as [string, RequestInit])[1].body as string,
    ) as { history: Array<{ role: string; content: string }>; query: string };
    expect(body.query).toBe('second question');
    expect(body.history).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'Answer one.' },
    ]);
  });

  it('a second send while a turn is pending is a no-op (in-flight guard, review H1)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fn = vi.fn(async () => {
      await gate;
      return sseResponse([{ type: 'text', content: 'Hi' }]);
    });
    vi.stubGlobal('fetch', fn);
    const { result } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('first');
    });
    await waitFor(() => expect(result.current.pending).toBe(true));
    act(() => {
      result.current.send('second'); // mid-stream double-Enter
    });

    release();
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(fn).toHaveBeenCalledTimes(1);
    // The second send never entered the thread — exactly one user echo.
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('aborts the in-flight fetch on unmount and appends nothing after (review H1)', async () => {
    let captured: AbortSignal | undefined;
    const fn = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          captured = init?.signal ?? undefined;
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fn);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useCrmChat());

    act(() => {
      result.current.send('hello');
    });
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    expect(captured?.aborted).toBe(false);

    unmount();
    expect(captured?.aborted).toBe(true);

    // Let the rejected fetch settle: the abort is swallowed silently — no
    // error bubble, no console noise, no unhandled rejection.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.messages.map((m) => m.role)).toEqual(['user']);
    expect(consoleError).not.toHaveBeenCalledWith('[crm-chat] turn failed:', expect.anything());
    consoleError.mockRestore();
  });
});
