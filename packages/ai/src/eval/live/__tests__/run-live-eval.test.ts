/**
 * AIN-93 Task 6 — full happy-path mocked-fetch integration test: 2 passing
 * scenarios + 1 forced failure, run through the REAL `runLiveEval`
 * orchestrator with a mocked `fetch` and fake DB/judge callbacks. Zero live
 * network calls — this is the harness's own regression guard.
 */
import { describe, expect, it, vi } from 'vitest';
import { runLiveEval } from '../run-live-eval';
import type { LiveScenario } from '../corpus';
import { SEED_LISTING_KEYS, type SeedListingKey } from '../seed-truth';

const SEED_IDS_BY_KEY = Object.fromEntries(
  SEED_LISTING_KEYS.map((key) => [key, `db-id-${key}`]),
) as Record<SeedListingKey, string>;

function sseResponse(frames: readonly Record<string, unknown>[]): Response {
  const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const PLAIN_INFO_SCENARIO: LiveScenario = {
  id: 'test-plain-info',
  bucket: 'plain_info_ask',
  description: 'A plain info ask with no tool call expected.',
  seedRefs: [],
  turns: [
    {
      query: 'What is a good rent-to-income ratio?',
      expect: { tool: [], show_card: false, grounding: 'none', judge: false },
    },
  ],
};

const RANK_SCENARIO: LiveScenario = {
  id: 'test-pick-for-me',
  bucket: 'pick_for_me',
  description: 'A rank_compare scenario referencing a known seeded id.',
  seedRefs: ['studio'],
  turns: [
    {
      query: 'Which one should I pick?',
      expect: { tool: ['rank_compare'], show_card: true, grounding: 'ranked_ids', judge: false },
    },
  ],
};

const FORCED_FAILURE_SCENARIO: LiveScenario = {
  id: 'test-forced-failure',
  bucket: 'unknown_listing',
  description: 'Deliberately expects a tool that never fires, to prove the runner surfaces a real failure.',
  seedRefs: [],
  turns: [
    {
      query: 'Save this for me',
      expect: { tool: ['add_listing'], show_card: false, grounding: 'none', judge: false },
    },
  ],
};

function buildFetchImpl() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string) as { query: string };
    if (body.query === PLAIN_INFO_SCENARIO.turns[0]!.query) {
      return sseResponse([
        { type: 'text', content: 'A common rule of thumb is 30% of gross income.' },
        { type: 'done' },
      ]);
    }
    if (body.query === RANK_SCENARIO.turns[0]!.query) {
      return sseResponse([
        { type: 'tool_call', name: 'rank_compare', args: { mode: 'rank' } },
        {
          type: 'tool_result',
          name: 'rank_compare',
          block: { type: 'text', content: 'Here is my pick.' },
          machineData: {
            kind: 'rank_compare',
            result: {
              mode: 'rank',
              ranked: [{ listingId: SEED_IDS_BY_KEY.studio, title: 'Studio', score: 91, breakdown: {} }],
            },
            show_card: true,
          },
        },
        { type: 'text', content: 'I recommend the studio — cheapest option, though it is small.' },
        { type: 'done' },
      ]);
    }
    // FORCED_FAILURE_SCENARIO — the assistant answers in prose with NO tool
    // call at all, even though the scenario expects `add_listing`.
    return sseResponse([
      { type: 'text', content: 'Sure, tell me the link and I can help.' },
      { type: 'done' },
    ]);
  }) as unknown as typeof fetch;
}

describe('runLiveEval — mocked-fetch happy path + forced failure', () => {
  it('reports 2 passing scenarios and 1 failing scenario', async () => {
    const fetchImpl = buildFetchImpl();
    const createConversation = vi.fn().mockResolvedValue('conv-1');
    const deleteConversation = vi.fn().mockResolvedValue(undefined);
    const deleteCreatedListings = vi.fn().mockResolvedValue(undefined);
    const fetchLatencyRow = vi.fn().mockResolvedValue({
      requestId: 'whatever',
      requestReceivedAt: '2026-07-07T12:00:00.000Z',
      firstModelTokenAt: '2026-07-07T12:00:01.000Z',
      requestCompletedAt: '2026-07-07T12:00:02.000Z',
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const report = await runLiveEval({
      scenarios: [PLAIN_INFO_SCENARIO, RANK_SCENARIO, FORCED_FAILURE_SCENARIO],
      baseUrl: 'https://example.test',
      accessToken: 'tok',
      campusSlug: 'uw-madison',
      seedIdsByKey: SEED_IDS_BY_KEY,
      fetchImpl,
      fetchLatencyRow,
      createConversation,
      deleteConversation,
      deleteCreatedListings,
      sleepFn,
      // Default RUNS_PER_SCENARIO (3) — the pass bar (>=2/3 runs) is defined
      // against exactly that many runs, so the happy-path test uses the real
      // default rather than a scaled-down count.
    });

    expect(report.scenarios).toHaveLength(3);
    const byId = Object.fromEntries(report.scenarios.map((s) => [s.scenarioId, s]));

    expect(byId['test-plain-info']!.scenarioPassed).toBe(true);
    expect(byId['test-pick-for-me']!.scenarioPassed).toBe(true);
    expect(byId['test-forced-failure']!.scenarioPassed).toBe(false);
    expect(byId['test-forced-failure']!.runs[0]!.turns[0]!.hardChecks.toolExpectation.pass).toBe(false);

    // 2/3 scenarios pass -> below the 90% overall bar
    expect(report.scenarioPassPct).toBeCloseTo(2 / 3);
    expect(report.passBarMet).toBe(false);

    // Cleanup fired once per scenario run (3 scenarios x 3 runs each = 9).
    expect(createConversation).toHaveBeenCalledTimes(9);
    expect(deleteConversation).toHaveBeenCalledTimes(9);
    // No add_listing tool ever actually fired, so no listings were created to clean up.
    expect(deleteCreatedListings).not.toHaveBeenCalled();
    // Pacing was honored (sleepFn called at least once per turn).
    expect(sleepFn).toHaveBeenCalled();
  });

  it('aborts remaining scenarios once the cost ceiling would be exceeded by a judged scenario', async () => {
    const judgedScenario: LiveScenario = {
      ...PLAIN_INFO_SCENARIO,
      id: 'judged-scenario',
      turns: [{ ...PLAIN_INFO_SCENARIO.turns[0]!, expect: { ...PLAIN_INFO_SCENARIO.turns[0]!.expect, judge: true } }],
    };
    const judge = vi.fn().mockResolvedValue({
      explicit_recommendation: false,
      tradeoffs_cited: [],
      grounded_in_saved_list: true,
      verdict: 'pass' as const,
      reasoning: 'fine',
    });

    const report = await runLiveEval({
      scenarios: [judgedScenario, judgedScenario],
      baseUrl: 'https://example.test',
      accessToken: 'tok',
      campusSlug: 'uw-madison',
      seedIdsByKey: SEED_IDS_BY_KEY,
      fetchImpl: buildFetchImpl(),
      fetchLatencyRow: vi.fn().mockResolvedValue(null),
      createConversation: vi.fn().mockResolvedValue('conv-1'),
      deleteConversation: vi.fn().mockResolvedValue(undefined),
      deleteCreatedListings: vi.fn().mockResolvedValue(undefined),
      sleepFn: vi.fn().mockResolvedValue(undefined),
      judge,
      runsPerScenario: 1,
      // Ceiling only covers ONE judge call (each estimated at $0.02).
      costCeilingUsd: 0.02,
    });

    expect(judge).toHaveBeenCalledTimes(1);
    expect(report.aborted).toBe(true);
    expect(report.scenarios).toHaveLength(1);
  });

  // CodeRabbit PR #123 fix 8 — a throw mid-scenario (here: fetchLatencyRow
  // rejecting, a real deps failure mode) must not skip the conversation /
  // created-listing cleanup. The `add_listing` tool fires FIRST, so a
  // listing id is captured before the throw — proving `deleteCreatedListings`
  // still runs with that id even though the scenario never completes.
  it('cleans up the conversation and any created listings even when a deps call throws mid-scenario', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        { type: 'tool_call', name: 'add_listing', args: {} },
        {
          type: 'tool_result',
          name: 'add_listing',
          block: { type: 'text', content: 'Saved.' },
          machineData: {
            kind: 'add_listing',
            result: { alreadySaved: false },
            listing: { id: 'leaked-listing-id' },
            show_card: true,
          },
        },
        { type: 'text', content: 'Saved it for you.' },
        { type: 'done' },
      ]),
    ) as unknown as typeof fetch;

    const createConversation = vi.fn().mockResolvedValue('conv-leak');
    const deleteConversation = vi.fn().mockResolvedValue(undefined);
    const deleteCreatedListings = vi.fn().mockResolvedValue(undefined);
    const fetchLatencyRow = vi.fn().mockRejectedValue(new Error('ai_request_metrics unreachable'));
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const scenario: LiveScenario = {
      id: 'leak-test',
      bucket: 'just_saved_followup',
      description: 'Forces a throw mid-scenario (fetchLatencyRow) to prove cleanup still runs (fix 8).',
      seedRefs: [],
      turns: [
        {
          query: 'save this for me',
          expect: { tool: ['add_listing'], show_card: true, grounding: 'none', judge: false },
        },
      ],
    };

    await expect(
      runLiveEval({
        scenarios: [scenario],
        baseUrl: 'https://example.test',
        accessToken: 'tok',
        campusSlug: 'uw-madison',
        seedIdsByKey: SEED_IDS_BY_KEY,
        fetchImpl,
        fetchLatencyRow,
        createConversation,
        deleteConversation,
        deleteCreatedListings,
        sleepFn,
        runsPerScenario: 1,
      }),
    ).rejects.toThrow(/ai_request_metrics unreachable/);

    expect(deleteConversation).toHaveBeenCalledWith('conv-leak');
    expect(deleteCreatedListings).toHaveBeenCalledWith(['leaked-listing-id']);
  });
});
