/**
 * AIN-93 — SSE parser + postTurn tests. All fetch calls are mocked (DI seam
 * `fetchImpl`) — this suite makes ZERO live network calls, per the plan's
 * "unit suite never calls prod" constraint. Fixture frames cover every
 * SSE type the live route can emit plus a malformed-line skip case.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseSseStream, postTurn, TURN_TIMEOUT_MS } from '../http-turn';

function sseBody(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

function sseResponse(chunks: readonly string[], status = 200): Response {
  return new Response(sseBody(chunks), {
    status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('parseSseStream', () => {
  it('parses text/tool_call/tool_result/mission/done/error frames', async () => {
    const events = await collect(
      parseSseStream(
        sseBody([
          'data: {"type":"text","content":"Hi there"}\n\n',
          'data: {"type":"tool_call","name":"rank_compare","args":{"mode":"rank"}}\n\n',
          'data: {"type":"tool_result","name":"rank_compare","block":{"type":"text","content":"ok"},"machineData":{"kind":"rank_compare"}}\n\n',
          'data: {"type":"mission_created","missionId":"m-1"}\n\n',
          'data: {"type":"error","message":"boom"}\n\n',
          'data: {"type":"done"}\n\n',
        ]),
      ),
    );

    expect(events).toEqual([
      { type: 'text', content: 'Hi there' },
      { type: 'tool_call', name: 'rank_compare', args: { mode: 'rank' } },
      {
        type: 'tool_result',
        name: 'rank_compare',
        block: { type: 'text', content: 'ok' },
        machineData: { kind: 'rank_compare' },
      },
      { type: 'mission_created', missionId: 'm-1' },
      { type: 'error', message: 'boom' },
      { type: 'done' },
    ]);
  });

  it('skips malformed JSON lines without throwing', async () => {
    const events = await collect(
      parseSseStream(
        sseBody([
          'data: {not valid json\n\n',
          'data: {"type":"text","content":"survives"}\n\n',
          'data: {"noTypeField": true}\n\n',
        ]),
      ),
    );
    expect(events).toEqual([{ type: 'text', content: 'survives' }]);
  });

  it('ignores non-data lines (comments, blank keepalives)', async () => {
    const events = await collect(
      parseSseStream(sseBody([': keepalive\n\n', 'data: {"type":"done"}\n\n'])),
    );
    expect(events).toEqual([{ type: 'done' }]);
  });
});

describe('postTurn', () => {
  it('attaches a self-generated x-request-id when none is passed', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return sseResponse(['data: {"type":"done"}\n\n']);
    }) as unknown as typeof fetch;

    const result = await postTurn({
      baseUrl: 'https://example.test',
      accessToken: 'tok',
      query: 'find me a 2br',
      campusSlug: 'uw-madison',
      fetchImpl,
    });

    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(capturedHeaders?.['x-request-id']).toBe(result.requestId);
  });

  it('uses a caller-supplied requestId verbatim', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(['data: {"type":"done"}\n\n'])) as unknown as typeof fetch;

    const result = await postTurn({
      baseUrl: 'https://example.test',
      accessToken: 'tok',
      query: 'q',
      campusSlug: 'uw-madison',
      requestId: 'fixed-request-id',
      fetchImpl,
    });

    expect(result.requestId).toBe('fixed-request-id');
  });

  it('sends surface:crm, the Bearer token, and JSON body fields', async () => {
    let capturedBody: string | undefined;
    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      capturedHeaders = init?.headers as Record<string, string>;
      return sseResponse(['data: {"type":"done"}\n\n']);
    }) as unknown as typeof fetch;

    await postTurn({
      baseUrl: 'https://example.test',
      accessToken: 'secret-token',
      query: 'what should I ask the landlord',
      campusSlug: 'uw-madison',
      conversationId: 'conv-1',
      fetchImpl,
    });

    expect(capturedHeaders?.Authorization).toBe('Bearer secret-token');
    const body = JSON.parse(capturedBody!);
    expect(body).toMatchObject({
      query: 'what should I ask the landlord',
      campusSlug: 'uw-madison',
      conversationId: 'conv-1',
      surface: 'crm',
    });
  });

  it('collects the full event stream and a redacted transcript with no auth header', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        'data: {"type":"text","content":"hello"}\n\n',
        'data: {"type":"done"}\n\n',
      ]),
    ) as unknown as typeof fetch;

    const result = await postTurn({
      baseUrl: 'https://example.test',
      accessToken: 'super-secret-token',
      query: 'q',
      campusSlug: 'uw-madison',
      fetchImpl,
    });

    expect(result.httpStatus).toBe(200);
    expect(result.events).toEqual([
      { type: 'text', content: 'hello' },
      { type: 'done' },
    ]);
    expect(result.transcript).not.toContain('super-secret-token');
    expect(result.transcript).not.toContain('Bearer');
  });

  it('synthesizes a single error event for a non-SSE error response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;

    const result = await postTurn({
      baseUrl: 'https://example.test',
      accessToken: 'tok',
      query: 'q',
      campusSlug: 'uw-madison',
      fetchImpl,
    });

    expect(result.httpStatus).toBe(429);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: 'error' });
  });

  // CodeRabbit PR #123 fixes 4 + 5 — a per-turn timeout + catching fetch
  // rejections so a network blip or a hung connection never throws out of
  // `postTurn` uncaught; both degrade to the SAME non-200-style failure
  // shape (`httpStatus: 0`) so every downstream check (`checkNoErrors`)
  // treats them uniformly as a failed turn.
  it('passes an AbortSignal.timeout(TURN_TIMEOUT_MS) to fetchImpl', async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal | undefined;
      return sseResponse(['data: {"type":"done"}\n\n']);
    }) as unknown as typeof fetch;

    await postTurn({ baseUrl: 'https://example.test', accessToken: 'tok', query: 'q', campusSlug: 'uw-madison', fetchImpl });

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(TURN_TIMEOUT_MS).toBe(90_000);
  });

  it('returns a failed (non-200-style) turn result instead of throwing when fetchImpl aborts on timeout', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }) as unknown as typeof fetch;

    const result = await postTurn({
      baseUrl: 'https://example.test',
      accessToken: 'tok',
      query: 'q',
      campusSlug: 'uw-madison',
      fetchImpl,
    });

    expect(result.httpStatus).toBe(0);
    expect(result.events).toEqual([]);
    expect(result.transcript).toMatch(/timeout/i);
  });

  it('returns a failed (non-200-style) turn result instead of throwing on a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const result = await postTurn({
      baseUrl: 'https://example.test',
      accessToken: 'tok',
      query: 'q',
      campusSlug: 'uw-madison',
      fetchImpl,
    });

    expect(result.httpStatus).toBe(0);
    expect(result.events).toEqual([]);
    expect(result.transcript).toBe('fetch failed');
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
