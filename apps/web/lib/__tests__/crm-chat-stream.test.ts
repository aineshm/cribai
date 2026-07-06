/**
 * Tests for the CRM chat SSE seam (AIN-65) — readCrmSseEvents (wire parsing)
 * + messagesFromToolResult (machineData → ChatMessage mapping) +
 * projectHistory (thread → text-projected history for the runtime route).
 */
import { describe, it, expect } from 'vitest';
import type { CrmListingRow, FirstSaveAnalysis, RankCompareResult } from '@campusnest/ai';
import type { ChatMessage } from '../crm/chat-messages';
import {
  messagesFromToolResult,
  projectHistory,
  readCrmSseEvents,
  type CrmSseEvent,
} from '../crm/chat-stream';

const VIEWER_ID = 'viewer-1';

const ROW: CrmListingRow = {
  id: 'b7e8f3a0-1111-4222-8333-444455556666',
  user_id: VIEWER_ID,
  source_url: 'https://www.zillow.com/x',
  source_site: 'zillow',
  title: 'Dayton Row · 2BR',
  nickname: null,
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

const COMPARE: RankCompareResult = {
  mode: 'compare',
  rows: [
    {
      listingId: ROW.id,
      title: 'Dayton Row',
      rent: 1650,
      bedrooms: 2,
      bathrooms: 1,
      sqft: 880,
      amenities: ['Dishwasher'],
    },
  ],
};

let counter = 0;
const nextId = (): string => `t_${++counter}`;

function sseBody(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<CrmSseEvent[]> {
  const events: CrmSseEvent[] = [];
  for await (const event of readCrmSseEvents(body)) events.push(event);
  return events;
}

describe('readCrmSseEvents', () => {
  it('parses data: lines into events and skips [DONE]', async () => {
    const events = await collect(
      sseBody([
        'data: {"type":"text","content":"Hi"}\n\n',
        'data: {"type":"done"}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    expect(events).toEqual([
      { type: 'text', content: 'Hi' },
      { type: 'done' },
    ]);
  });

  it('reassembles events split across chunk boundaries', async () => {
    const events = await collect(
      sseBody(['data: {"type":"text","con', 'tent":"split"}\n\ndata: {"ty', 'pe":"done"}\n\n']),
    );
    expect(events).toEqual([
      { type: 'text', content: 'split' },
      { type: 'done' },
    ]);
  });

  it('ignores non-data lines and malformed JSON without throwing', async () => {
    const events = await collect(
      sseBody([': keep-alive comment\n\n', 'data: {not json}\n\n', 'data: {"type":"done"}\n\n']),
    );
    expect(events).toEqual([{ type: 'done' }]);
  });

  it('flushes a trailing event the server sent without a final newline (tail-flush branch)', async () => {
    const events = await collect(
      sseBody(['data: {"type":"text","content":"Hi"}\n\n', 'data: {"type":"done"}']),
    );
    expect(events).toEqual([
      { type: 'text', content: 'Hi' },
      { type: 'done' },
    ]);
  });
});

describe('messagesFromToolResult', () => {
  it('add_listing with a listing row → one saved-unit card (https-filtered photos, viewer attribution)', () => {
    const messages = messagesFromToolResult(
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
      VIEWER_ID,
      nextId,
    );
    expect(messages).toHaveLength(1);
    const msg = messages[0]!;
    expect(msg.kind).toBe('saved-unit');
    if (msg.kind !== 'saved-unit') throw new Error('unreachable');
    expect(msg.role).toBe('assistant');
    expect(msg.unit.id).toBe(ROW.id);
    expect(msg.unit.photo_urls).toEqual(['https://cdn.example/b.jpg']);
    expect(msg.unit._proposed.addedBy).toBe(VIEWER_ID);
  });

  it('add_listing with listing:null degrades to the text block', () => {
    const messages = messagesFromToolResult(
      {
        type: 'tool_result',
        name: 'add_listing',
        block: { type: 'text', content: 'Saved — open My Apartments to see it.' },
        machineData: {
          kind: 'add_listing',
          result: { listingId: ROW.id, alreadySaved: false, confidence: 0.9 },
          listing: null,
        },
      },
      VIEWER_ID,
      nextId,
    );
    expect(messages).toEqual([
      expect.objectContaining({
        kind: 'text',
        role: 'assistant',
        text: 'Saved — open My Apartments to see it.',
      }),
    ]);
  });

  it('first_save_analysis → analysis card + steering message when the question landed', () => {
    const messages = messagesFromToolResult(
      {
        type: 'tool_result',
        name: 'first_save_analysis',
        block: { type: 'text', content: 'Analysis complete.' },
        machineData: { kind: 'first_save_analysis', analysis: ANALYSIS },
      },
      VIEWER_ID,
      nextId,
    );
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual(
      expect.objectContaining({ kind: 'analysis', role: 'assistant', analysis: ANALYSIS }),
    );
    expect(messages[1]).toEqual(
      expect.objectContaining({
        kind: 'steering',
        role: 'assistant',
        text: 'Parking or no parking?',
      }),
    );
  });

  it('first_save_analysis without a steering question → analysis card only', () => {
    const noSteering: FirstSaveAnalysis = {
      ...ANALYSIS,
      steeringQuestion: { status: 'skipped', reason: 'not first save' },
    };
    const messages = messagesFromToolResult(
      {
        type: 'tool_result',
        name: 'first_save_analysis',
        block: { type: 'text', content: 'Analysis complete.' },
        machineData: { kind: 'first_save_analysis', analysis: noSteering },
      },
      VIEWER_ID,
      nextId,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]!.kind).toBe('analysis');
  });

  it.each([
    ['rank', RANK],
    ['compare', COMPARE],
  ] as const)('rank_compare (%s mode) → one rank card carrying the result as-is', (_mode, result) => {
    const messages = messagesFromToolResult(
      {
        type: 'tool_result',
        name: 'rank_compare',
        block: { type: 'text', content: 'Ranked.' },
        machineData: { kind: 'rank_compare', result },
      },
      VIEWER_ID,
      nextId,
    );
    expect(messages).toEqual([
      expect.objectContaining({ kind: 'rank', role: 'assistant', result }),
    ]);
  });

  it('unrecognized machineData kinds degrade to the text block (covers infer_profile)', () => {
    const messages = messagesFromToolResult(
      {
        type: 'tool_result',
        name: 'infer_profile',
        block: { type: 'text', content: 'Got a sense of what you like.' },
        machineData: { kind: 'infer_profile', result: { status: 'needs_more_data' } },
      },
      VIEWER_ID,
      nextId,
    );
    expect(messages).toEqual([
      expect.objectContaining({ kind: 'text', text: 'Got a sense of what you like.' }),
    ]);
  });

  it('no machineData → renders block.content as text (sign-in gate / errors / legacy tools)', () => {
    const messages = messagesFromToolResult(
      {
        type: 'tool_result',
        name: 'add_listing',
        block: { type: 'text', content: 'Sign in to save listings.' },
      },
      VIEWER_ID,
      nextId,
    );
    expect(messages).toEqual([
      expect.objectContaining({ kind: 'text', text: 'Sign in to save listings.' }),
    ]);
  });

  it('no machineData and no usable text block → no messages', () => {
    expect(
      messagesFromToolResult({ type: 'tool_result', name: 'search_listings' }, VIEWER_ID, nextId),
    ).toEqual([]);
    // EMPTY result blocks still render nothing — the model's prose covers no-results.
    expect(
      messagesFromToolResult(
        { type: 'tool_result', name: 'search_listings', block: { type: 'map', listings: [] } },
        VIEWER_ID,
        nextId,
      ),
    ).toEqual([]);
  });

  it('silences legacy listing_card blocks instead of rendering the Explore stub', () => {
    const messages = messagesFromToolResult(
      {
        type: 'tool_result',
        name: 'search_listings',
        block: { type: 'listing_card', listings: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      },
      VIEWER_ID,
      nextId,
    );
    expect(messages).toEqual([]);
  });

  it('silences legacy map blocks with listings', () => {
    const messages = messagesFromToolResult(
      {
        type: 'tool_result',
        name: 'search_listings',
        block: { type: 'map', listings: [{ id: 'a' }] },
      },
      VIEWER_ID,
      nextId,
    );
    expect(messages).toEqual([]);
  });

  it('never emits text mentioning the Explore page from any tool_result', () => {
    // Sweep guard: all fixture events produce no "Explore" mention in output.
    const fixtureEvents: CrmSseEvent[] = [
      { type: 'tool_result', name: 'search_listings', block: { type: 'listing_card', listings: [{}] } },
      { type: 'tool_result', name: 'search_listings', block: { type: 'map', listings: [{}] } },
      { type: 'tool_result', name: 'search_listings' },
      { type: 'tool_result', name: 'add_listing', block: { type: 'text', content: 'Saved!' },
        machineData: { kind: 'add_listing', result: { listingId: ROW.id, alreadySaved: false, confidence: 0.9 }, listing: ROW } },
    ];
    for (const event of fixtureEvents) {
      const messages = messagesFromToolResult(event, VIEWER_ID, nextId);
      for (const msg of messages) {
        if (msg.kind === 'text' || msg.kind === 'steering') {
          expect(msg.text).not.toContain('Explore');
        }
      }
    }
  });

  describe('show_card (Task 5)', () => {
    it('suppresses the saved-unit card when show_card is false', () => {
      const event: CrmSseEvent = {
        type: 'tool_result',
        name: 'add_listing',
        block: { type: 'text', content: 'Saved!' },
        machineData: {
          kind: 'add_listing',
          result: { listingId: ROW.id, alreadySaved: false, confidence: 0.9 },
          listing: ROW,
          show_card: false,
        },
      };
      expect(messagesFromToolResult(event, VIEWER_ID, nextId)).toEqual([]);
    });

    it('suppresses analysis card AND steering bubble when show_card is false', () => {
      const event: CrmSseEvent = {
        type: 'tool_result',
        name: 'first_save_analysis',
        block: { type: 'text', content: 'Analysis complete.' },
        machineData: {
          kind: 'first_save_analysis',
          analysis: ANALYSIS,
          show_card: false,
        },
      };
      expect(messagesFromToolResult(event, VIEWER_ID, nextId)).toEqual([]);
    });

    it('renders the rank card when show_card is true', () => {
      const event: CrmSseEvent = {
        type: 'tool_result',
        name: 'rank_compare',
        block: { type: 'text', content: 'Ranked.' },
        machineData: {
          kind: 'rank_compare',
          result: RANK,
          show_card: true,
        },
      };
      const messages = messagesFromToolResult(event, VIEWER_ID, nextId);
      expect(messages[0]?.kind).toBe('rank');
    });

    it('renders the card when show_card is absent — default-on (legacy events)', () => {
      const event: CrmSseEvent = {
        type: 'tool_result',
        name: 'add_listing',
        block: { type: 'text', content: 'Saved!' },
        machineData: {
          kind: 'add_listing',
          result: { listingId: ROW.id, alreadySaved: false, confidence: 0.9 },
          listing: ROW,
          // no show_card key → default on
        },
      };
      const messages = messagesFromToolResult(event, VIEWER_ID, nextId);
      expect(messages[0]?.kind).toBe('saved-unit');
    });
  });
});

describe('projectHistory', () => {
  it('projects every message kind to a text turn with the right role', () => {
    const thread: readonly ChatMessage[] = [
      { id: '1', kind: 'text', role: 'user', text: 'rank my places' },
      { id: '2', kind: 'rank', role: 'assistant', result: RANK },
      { id: '3', kind: 'steering', role: 'assistant', text: 'Parking or no parking?' },
      {
        id: '4',
        kind: 'saved-unit',
        role: 'assistant',
        unit: {
          ...ROW,
          floorPlans: [],
          priceIsFrom: false,
          _proposed: {
            unit: { building: 'Dayton Row · 2BR', floorPlan: '', unitLabel: '2 bed' },
            amenitySplit: { unit: [], building: [] },
            application: {
              stage: 'saved',
              deadline: null,
              deadlineLabel: null,
              submittedAt: null,
              documents: [],
            },
            addedBy: VIEWER_ID,
          },
        },
      },
      { id: '5', kind: 'analysis', role: 'assistant', analysis: ANALYSIS },
    ];
    const history = projectHistory(thread);
    expect(history).toHaveLength(5);
    expect(history[0]).toEqual({ role: 'user', content: 'rank my places' });
    expect(history[1]!.role).toBe('assistant');
    expect(history[1]!.content.length).toBeGreaterThan(0);
    expect(history[2]).toEqual({ role: 'assistant', content: 'Parking or no parking?' });
    // Card kinds project to short text summaries, never empty strings.
    expect(history[3]!.content).toContain('Dayton Row');
    expect(history[4]!.content.length).toBeGreaterThan(0);
  });

  it('drops whitespace-only text turns', () => {
    const history = projectHistory([{ id: '1', kind: 'text', role: 'user', text: '   ' }]);
    expect(history).toEqual([]);
  });
});
