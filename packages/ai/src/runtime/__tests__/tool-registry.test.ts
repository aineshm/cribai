/**
 * PDR-004 Track A Day 1 — Tool Registry tests
 *
 * Verifies the static shape of the LLM-first tool registry:
 *   - All 13 tools are present with the expected names
 *   - Names match the canonical `ToolName` union (parity with the deterministic
 *     `CRIBAI_TOOLS_BY_NAME` registry)
 *   - Every tool has a non-empty `description` (LLM `when_to_call` hint)
 *   - Every tool's Zod `inputSchema` validates a known-good payload
 *   - HITL tools (`schedule_tour`, `create_sublease`) carry the explicit
 *     handler-enforced preview/confirm reminder in the description
 *
 * Does NOT exercise handlers — those need a Supabase context and are covered
 * by the existing per-handler test suites.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  TOOL_SPECS,
  HITL_TOOLS,
  buildToolRegistry,
  toolSpecsForSurface,
  type ToolSpec,
  type ToolResultSink,
  type RegistryToolName,
} from '../tool-registry';
import { CRIBAI_TOOLS_BY_NAME } from '../../tools/schemas';
import { executeTool } from '../../tools/executor';
import { CRM_TOOL_NAMES, type CrmToolName } from '../../crm';
import type { ToolContext, ToolName } from '../../tools/types';
import type { ToolResult } from '../../tools/types';

// The sink-refactor tests stub `executeTool` so they can assert what the
// registry does with its result WITHOUT a live Supabase context. The
// allowlist test re-imports the real implementation per-case.
vi.mock('../../tools/executor', () => ({
  executeTool: vi.fn(),
}));

// AIN-15 Phase 2 — the CRM tools route through their `crm/` handlers, NOT
// `executeTool`. Mock the 4 handlers so the registry-level CRM tests stay
// offline. The barrel re-export of schemas/descriptions is preserved (the
// registry imports them at construction).
vi.mock('../../crm', async (orig) => {
  const actual = await orig<typeof import('../../crm')>();
  return {
    ...actual,
    addListingHandler: vi.fn(),
    firstSaveAnalysisHandler: vi.fn(),
    inferProfileHandler: vi.fn(),
    rankCompareHandler: vi.fn(),
  };
});
import {
  addListingHandler,
  firstSaveAnalysisHandler,
  inferProfileHandler,
  rankCompareHandler,
} from '../../crm';

/** The 13 legacy tools, in canonical order (routed via `executeTool`). */
const EXPECTED_LEGACY_NAMES: readonly ToolName[] = [
  'search_listings',
  'get_listing_detail',
  'compare_listings',
  'schedule_tour',
  'explain_lease_term',
  'get_landlord_info',
  'get_saved_listings',
  'web_search',
  'get_reviews',
  'contact_pm',
  'get_neighborhood_info',
  'create_sublease',
  'propose_mission',
];

/** The 4 CRM tools (AIN-15 Phase 2), in canonical order (routed via handlers). */
const EXPECTED_CRM_NAMES: readonly CrmToolName[] = [
  'add_listing',
  'first_save_analysis',
  'infer_profile',
  'rank_compare',
];

/** Full registry: 13 legacy + 4 CRM = 17 tools, in canonical order. */
const EXPECTED_NAMES = [...EXPECTED_LEGACY_NAMES, ...EXPECTED_CRM_NAMES];

/** Minimum-valid payload per tool — sufficient for `safeParse` to succeed. */
const VALID_INPUT_BY_TOOL: Record<ToolName | CrmToolName, Record<string, unknown>> = {
  search_listings: { semantic_query: 'quiet near campus' },
  get_listing_detail: { listing_id: '11111111-2222-4333-8444-555555555555' },
  compare_listings: {
    listing_ids: [
      '11111111-2222-4333-8444-555555555555',
      '66666666-7777-4888-8999-aaaaaaaaaaaa',
    ],
  },
  schedule_tour: {
    listing_id: '11111111-2222-4333-8444-555555555555',
    student_name: 'Ainesh Mohan',
    student_email: 'student@wisc.edu',
    preferred_dates: ['2026-06-15'],
  },
  explain_lease_term: { term: 'security deposit' },
  get_landlord_info: { name: 'Madison Property Management' },
  get_saved_listings: {},
  web_search: { query: '3 bed near UW under $1500' },
  get_reviews: { listing_id: '11111111-2222-4333-8444-555555555555' },
  contact_pm: { listing_id: '11111111-2222-4333-8444-555555555555' },
  get_neighborhood_info: { address: '456 W Gorham St, Madison, WI' },
  create_sublease: {
    address: '456 W Gorham St, Madison WI',
    bedrooms_total: 2,
    bedrooms_available: 1,
  },
  propose_mission: { intent: 'housing_search' },
  // CRM tools (AIN-15 Phase 2)
  add_listing: { url: 'https://zillow.com/homedetails/123' },
  first_save_analysis: { listing_id: '11111111-2222-4333-8444-555555555555' },
  infer_profile: {},
  rank_compare: { mode: 'rank' },
};

describe('tool-registry — static spec', () => {
  it('exposes exactly 17 tools (13 legacy + 4 CRM)', () => {
    expect(TOOL_SPECS).toHaveLength(17);
  });

  it('exposes the canonical tool names in canonical order (legacy then CRM)', () => {
    const actual = TOOL_SPECS.map((spec) => spec.name);
    expect(actual).toEqual(EXPECTED_NAMES);
  });

  it('anti-drift: every legacy executor tool is present, every CRM tool is present, and the only non-legacy specs are the CRM tools', () => {
    const specNames = new Set(TOOL_SPECS.map((spec) => spec.name));
    const legacyNames = new Set(Object.keys(CRIBAI_TOOLS_BY_NAME));

    // Every legacy (executor) tool surfaces in the LLM-first registry.
    for (const name of legacyNames) {
      expect(specNames.has(name as ToolName)).toBe(true);
    }
    // Every CRM tool surfaces too (AIN-15 Phase 2).
    for (const name of CRM_TOOL_NAMES) {
      expect(specNames.has(name)).toBe(true);
    }
    // The ONLY specs that aren't legacy executor tools are exactly the CRM
    // tools — this keeps the drift guard meaningful: a stray new tool that is
    // neither legacy nor CRM would fail here.
    const nonLegacy = [...specNames].filter((n) => !legacyNames.has(n));
    expect(new Set(nonLegacy)).toEqual(new Set(CRM_TOOL_NAMES));
    expect(specNames.size).toBe(legacyNames.size + CRM_TOOL_NAMES.length);
  });

  it('gives every tool a non-empty `when_to_call` description', () => {
    for (const spec of TOOL_SPECS) {
      expect(spec.description.trim().length).toBeGreaterThan(0);
      // Sanity floor: a useful hint is more than a few words
      expect(spec.description.length).toBeGreaterThan(20);
    }
  });

  it('annotates HITL tools with the preview/confirm reminder', () => {
    expect(HITL_TOOLS).toEqual(['schedule_tour', 'create_sublease']);

    for (const name of HITL_TOOLS) {
      const spec = TOOL_SPECS.find((s) => s.name === name);
      expect(spec).toBeDefined();
      const description = spec!.description.toLowerCase();
      // Must talk about HITL / preview / confirm at the LLM-prompt level
      expect(
        description.includes('hitl') ||
          description.includes('confirm') ||
          description.includes('preview'),
      ).toBe(true);
    }
  });

  it('produces input schemas that validate a minimum-valid payload per tool', () => {
    for (const spec of TOOL_SPECS) {
      const payload = VALID_INPUT_BY_TOOL[spec.name];
      const parsed = (spec.inputSchema as z.ZodTypeAny).safeParse(payload);
      if (!parsed.success) {
        // Surface the failure in a readable shape if a schema drifts
        throw new Error(
          `[tool-registry] inputSchema for ${spec.name} rejected the known-good payload: ${parsed.error.message}`,
        );
      }
      expect(parsed.success).toBe(true);
    }
  });

  it('snapshot — names + description first line + required input fields', () => {
    const summary = TOOL_SPECS.map((spec: ToolSpec) => {
      const firstLine = spec.description.split('\n')[0]!.trim();
      // Truncate to keep the snapshot tight and reviewable
      const headline =
        firstLine.length > 160 ? firstLine.slice(0, 160) + '…' : firstLine;
      // ZodObject exposes `.shape`; record which keys are required for snapshot stability
      const shape = (spec.inputSchema as z.ZodObject<z.ZodRawShape>).shape;
      const requiredKeys = Object.entries(shape)
        .filter(([, type]) => !(type as z.ZodTypeAny).isOptional())
        .map(([key]) => key)
        .sort();
      return { name: spec.name, headline, requiredKeys };
    });
    expect(summary).toMatchInlineSnapshot(`
      [
        {
          "headline": "Search for student housing listings AND subleases near campus. Use this when the user wants to find apartments or subleases — e.g., "find me a 2-bedroom", "show…",
          "name": "search_listings",
          "requiredKeys": [],
        },
        {
          "headline": "Get full details for a specific listing including true cost breakdown and fairness analysis. Use when the user asks for more details about a specific listing.",
          "name": "get_listing_detail",
          "requiredKeys": [
            "listing_id",
          ],
        },
        {
          "headline": "Compare 2-4 listings side by side. Use when the user wants to compare specific apartments.",
          "name": "compare_listings",
          "requiredKeys": [
            "listing_ids",
          ],
        },
        {
          "headline": "Schedule a tour for a specific listing. Two-phase HITL flow: call WITHOUT \`confirmed\` (or \`confirmed=false\`) to render a preview card (listing + dates + email) …",
          "name": "schedule_tour",
          "requiredKeys": [
            "listing_id",
            "preferred_dates",
            "student_email",
            "student_name",
          ],
        },
        {
          "headline": "Explain a lease or rental term. Use when the user asks about lease clauses, tenant rights, or rental terminology.",
          "name": "explain_lease_term",
          "requiredKeys": [
            "term",
          ],
        },
        {
          "headline": "Get landlord information and review summary. Use when the user asks about a landlord or property management company.",
          "name": "get_landlord_info",
          "requiredKeys": [],
        },
        {
          "headline": "Get the user's saved/favorited listings. Use when the user asks about their saved listings, favorites, or references 'my saved', 'my favorites'.",
          "name": "get_saved_listings",
          "requiredKeys": [],
        },
        {
          "headline": "Search the web for rental listings and housing information when the local database does not have enough results. Use this when search_listings returns fewer tha…",
          "name": "web_search",
          "requiredKeys": [
            "query",
          ],
        },
        {
          "headline": "Get reviews and community feedback for a property or landlord. Use when the user asks about reviews, ratings, or tenant experiences for a listing.",
          "name": "get_reviews",
          "requiredKeys": [],
        },
        {
          "headline": "Send a message or inquiry to a property manager. Use when the user wants to contact a landlord or property manager about a listing.",
          "name": "contact_pm",
          "requiredKeys": [
            "listing_id",
          ],
        },
        {
          "headline": "Get neighborhood information including walkability, safety, commute times, and local vibe. Use when the user asks about the area around a listing.",
          "name": "get_neighborhood_info",
          "requiredKeys": [],
        },
        {
          "headline": "Create a sublease listing on CribAI. This is a two-phase tool:",
          "name": "create_sublease",
          "requiredKeys": [
            "address",
            "bedrooms_available",
            "bedrooms_total",
          ],
        },
        {
          "headline": "Propose a background mission when the student describes a complex, multi-step housing need (e.g., comprehensive apartment search with many criteria, scheduling …",
          "name": "propose_mission",
          "requiredKeys": [
            "intent",
          ],
        },
        {
          "headline": "Save a listing from any URL the user pastes into their personal CRM, then analyze it.",
          "name": "add_listing",
          "requiredKeys": [
            "url",
          ],
        },
        {
          "headline": "Run the wow-moment analysis (true cost, red flags, nearby places, steering question) on a freshly saved CRM listing.",
          "name": "first_save_analysis",
          "requiredKeys": [
            "listing_id",
          ],
        },
        {
          "headline": "Infer a structured housing-preference profile from the user's saved CRM listings and persist it.",
          "name": "infer_profile",
          "requiredKeys": [],
        },
        {
          "headline": "Rank the user's saved CRM listings by weighted score, or produce a side-by-side comparison table.",
          "name": "rank_compare",
          "requiredKeys": [],
        },
      ]
    `);
  });
});

describe('tool-registry — buildToolRegistry()', () => {
  it('builds a frozen registry with the canonical 17 keys (13 legacy + 4 CRM)', () => {
    const fakeContext = {
      supabase: {} as never,
      campusId: 'campus-uw-madison',
      campusSlug: 'uw-madison',
    } as ToolContext;

    const registry = buildToolRegistry(fakeContext, () => {});
    const keys = Object.keys(registry).sort();
    const expected = [...EXPECTED_NAMES].sort();
    expect(keys).toEqual(expected);

    // Each entry is an `ai`-SDK tool with description + execute
    for (const name of EXPECTED_NAMES) {
      const t = registry[name];
      expect(t).toBeDefined();
      expect(typeof (t as { description?: unknown }).description).toBe('string');
      expect(typeof (t as { execute?: unknown }).execute).toBe('function');
    }

    // Frozen — registry should not be mutated by accident
    expect(Object.isFrozen(registry)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PDR-004 codex P1 (PR #69): execute must return ONLY the string modelContext
// to the model, while the full ToolResult is routed out-of-band to the sink.
// ---------------------------------------------------------------------------

const TOOL_EXEC_OPTS = { toolCallId: 'call-1', messages: [] } as never;

describe('tool-registry — sink refactor (codex P1)', () => {
  it('execute returns the string modelContext to the model, sink gets the full ToolResult', async () => {
    const statePatch = { selectedListingId: 'listing-xyz' } as const;
    const fullResult = {
      modelContext: 'Found 3 listings near campus.',
      clientBlock: { type: 'text', content: 'rendered card' },
      machineData: { count: 3 },
      statePatch,
    };

    vi.mocked(executeTool).mockResolvedValueOnce(fullResult as never);

    const sinkCalls: Array<{ id: string; name: string; result: unknown }> = [];
    const registry = buildToolRegistry(
      { supabase: {} as never, campusId: 'c', campusSlug: 'uw-madison' } as ToolContext,
      (id, name, result) => sinkCalls.push({ id, name, result }),
    );

    const execute = (registry.search_listings as { execute: (...a: unknown[]) => Promise<unknown> }).execute;
    const returned = await execute({ semantic_query: 'near campus' }, TOOL_EXEC_OPTS);

    // The model only ever sees the string.
    expect(returned).toBe('Found 3 listings near campus.');
    expect(typeof returned).toBe('string');

    // The sink received the toolCallId + FULL ToolResult (statePatch + block).
    expect(sinkCalls).toHaveLength(1);
    expect(sinkCalls[0]!.id).toBe('call-1');
    expect(sinkCalls[0]!.name).toBe('search_listings');
    expect(sinkCalls[0]!.result).toEqual(fullResult);
    expect((sinkCalls[0]!.result as typeof fullResult).statePatch).toEqual(statePatch);
  });

  it('routes through executeTool so the guest allowlist still throws', async () => {
    // Real executeTool (unmocked) for this assertion — the allowlist guard
    // lives there, and the registry must NOT bypass it.
    vi.mocked(executeTool).mockImplementationOnce(
      (await vi.importActual<typeof import('../../tools/executor')>('../../tools/executor'))
        .executeTool,
    );

    const sinkCalls: unknown[] = [];
    const registry = buildToolRegistry(
      {
        supabase: {} as never,
        campusId: 'c',
        campusSlug: 'uw-madison',
        allowedToolNames: ['search_listings'], // guest allowlist — schedule_tour excluded
      } as ToolContext,
      (_id, _name, result) => sinkCalls.push(result),
    );

    const execute = (registry.schedule_tour as { execute: (...a: unknown[]) => Promise<unknown> }).execute;

    await expect(
      execute(
        {
          listing_id: '11111111-2222-4333-8444-555555555555',
          student_name: 'A',
          student_email: 'a@wisc.edu',
          preferred_dates: ['2026-06-15'],
        },
        TOOL_EXEC_OPTS,
      ),
    ).rejects.toThrow(/signing in/i);

    // Sink must NOT fire when the executor rejects.
    expect(sinkCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PDR-004 codex P2 (AIN-8): per-turn tool-execution budget. `stepCountIs` caps
// model ROUND-TRIPS, not tool executions — when the model emits several tool
// calls in ONE step the SDK runs ALL of them before re-checking the stop
// condition. The budget enforces the legacy per-turn cap (5 auth / 2 guest)
// at the `execute` seam so parallel calls in a single step are also capped:
// once the limit is reached, `executeTool` is NOT invoked (no side effect, no
// mission row), the sink does NOT fire, and the model gets a short string.
// ---------------------------------------------------------------------------

describe('tool-registry — per-turn tool-call budget (codex P2)', () => {
  // These tests use persistent mocks (mockResolvedValue / mockImplementation)
  // and assert exact call counts, so reset the spy between each.
  beforeEach(() => {
    vi.mocked(executeTool).mockReset();
  });

  it('does NOT count executions when no budget is supplied (back-compat)', async () => {
    vi.mocked(executeTool).mockResolvedValue({
      modelContext: 'ok',
      clientBlock: { type: 'text', content: 'x' },
    } as never);

    const registry = buildToolRegistry(
      { supabase: {} as never, campusId: 'c', campusSlug: 'uw-madison' } as ToolContext,
      () => {},
    );
    const execute = (registry.search_listings as { execute: (...a: unknown[]) => Promise<unknown> }).execute;

    // Many calls with no budget — all execute.
    for (let i = 0; i < 10; i++) {
      await execute({ semantic_query: 'x' }, { toolCallId: `c${i}`, messages: [] } as never);
    }
    expect(vi.mocked(executeTool)).toHaveBeenCalledTimes(10);
  });

  it('rejects executions beyond the limit: executeTool not called, sink not fired, model gets a string', async () => {
    vi.mocked(executeTool).mockResolvedValue({
      modelContext: 'Found listings.',
      clientBlock: { type: 'text', content: 'card' },
    } as never);

    const sinkCalls: unknown[] = [];
    const budget = { limit: 2, count: 0 };
    const registry = buildToolRegistry(
      { supabase: {} as never, campusId: 'c', campusSlug: 'uw-madison' } as ToolContext,
      (_id, _name, result) => sinkCalls.push(result),
      budget,
    );
    const execute = (registry.search_listings as { execute: (...a: unknown[]) => Promise<unknown> }).execute;

    const r1 = await execute({ semantic_query: 'a' }, { toolCallId: 'c1', messages: [] } as never);
    const r2 = await execute({ semantic_query: 'b' }, { toolCallId: 'c2', messages: [] } as never);
    const r3 = await execute({ semantic_query: 'c' }, { toolCallId: 'c3', messages: [] } as never);

    // First two run; third is rejected by the budget.
    expect(r1).toBe('Found listings.');
    expect(r2).toBe('Found listings.');
    expect(r3).toMatch(/limit reached/i);

    expect(vi.mocked(executeTool)).toHaveBeenCalledTimes(2);
    expect(sinkCalls).toHaveLength(2);
  });

  it('caps PARALLEL calls in a single step (the codex P2 case)', async () => {
    // Simulate the SDK firing N execute() closures concurrently within ONE
    // step. The check+increment must be synchronous so the (limit+1)-th call
    // sees the budget exhausted even though all started before any resolved.
    vi.mocked(executeTool).mockImplementation(
      (async () => {
        // Force a microtask gap so all parallel calls interleave at the await.
        await Promise.resolve();
        return { modelContext: 'ok', clientBlock: { type: 'text', content: 'x' } };
      }) as never,
    );

    const sinkCalls: unknown[] = [];
    const budget = { limit: 3, count: 0 };
    const registry = buildToolRegistry(
      { supabase: {} as never, campusId: 'c', campusSlug: 'uw-madison' } as ToolContext,
      (_id, _name, result) => sinkCalls.push(result),
      budget,
    );
    const execute = (registry.search_listings as { execute: (...a: unknown[]) => Promise<unknown> }).execute;

    // Fire 5 parallel executions (2 over the limit of 3).
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        execute({ semantic_query: `q${i}` }, { toolCallId: `c${i}`, messages: [] } as never),
      ),
    );

    const executed = results.filter((r) => r === 'ok');
    const rejected = results.filter((r) => typeof r === 'string' && /limit reached/i.test(r as string));
    expect(executed).toHaveLength(3);
    expect(rejected).toHaveLength(2);

    // No side effect beyond the cap.
    expect(vi.mocked(executeTool)).toHaveBeenCalledTimes(3);
    expect(sinkCalls).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// AIN-15 Phase 2: the 4 CRM tools are registered ALONGSIDE the 13 legacy tools
// but route through their `crm/` handlers directly (NOT `executeTool`). Their
// `execute` closure must honor the SAME contract as the legacy path: the
// budget atomic check-and-increment fires first, the sink receives the full
// ToolResult keyed by toolCallId, and only the string `modelContext` is
// returned to the model (never the clientBlock). The handlers' own sign-in
// gate is preserved (no userId → SIGN_IN_RESULT modelContext, sink still fires
// the sign-in block — handlers never throw).
// ---------------------------------------------------------------------------

describe('tool-registry — CRM tool path (AIN-15 Phase 2)', () => {
  const mockAddListing = vi.mocked(addListingHandler);
  const mockFirstSave = vi.mocked(firstSaveAnalysisHandler);
  const mockInfer = vi.mocked(inferProfileHandler);
  const mockRank = vi.mocked(rankCompareHandler);

  beforeEach(() => {
    vi.mocked(executeTool).mockReset();
    mockAddListing.mockReset();
    mockFirstSave.mockReset();
    mockInfer.mockReset();
    mockRank.mockReset();
  });

  function crmExecute(name: 'add_listing' | 'first_save_analysis' | 'infer_profile' | 'rank_compare') {
    const sinkCalls: Array<{ id: string; name: string; result: unknown }> = [];
    const budget = { limit: 5, count: 0 };
    const registry = buildToolRegistry(
      { supabase: {} as never, campusId: 'c', campusSlug: 'uw-madison', userId: 'u-1' } as ToolContext,
      (id, n, result) => sinkCalls.push({ id, name: n, result }),
      budget,
    );
    const execute = (registry[name] as { execute: (...a: unknown[]) => Promise<unknown> }).execute;
    return { execute, sinkCalls, budget };
  }

  it('routes add_listing through addListingHandler (NOT executeTool); sink gets full ToolResult, model gets only modelContext', async () => {
    const full: ToolResult = {
      modelContext: 'Saved listing abc. INSTRUCTIONS: call first_save_analysis with listing_id="abc".',
      clientBlock: { type: 'text', content: 'Listing saved to your CRM!' },
    };
    mockAddListing.mockResolvedValueOnce(full);

    const { execute, sinkCalls } = crmExecute('add_listing');
    const returned = await execute(
      { url: 'https://zillow.com/x' },
      { toolCallId: 'call-crm-1', messages: [] },
    );

    // Handler called, executeTool NOT touched (CRM never flows through it).
    expect(mockAddListing).toHaveBeenCalledOnce();
    expect(vi.mocked(executeTool)).not.toHaveBeenCalled();

    // Model sees ONLY the string modelContext — never the clientBlock.
    expect(returned).toBe(full.modelContext);
    expect(typeof returned).toBe('string');
    expect(returned).not.toContain('Listing saved to your CRM!');

    // Sink got the toolCallId + FULL ToolResult.
    expect(sinkCalls).toHaveLength(1);
    expect(sinkCalls[0]!.id).toBe('call-crm-1');
    expect(sinkCalls[0]!.name).toBe('add_listing');
    expect(sinkCalls[0]!.result).toEqual(full);
  });

  it('streams first_save_analysis, infer_profile, rank_compare through their handlers too', async () => {
    const fsa: ToolResult = { modelContext: 'analysis mc', clientBlock: { type: 'text', content: 'analysis' } };
    const inf: ToolResult = { modelContext: 'profile mc', clientBlock: { type: 'text', content: 'profile' } };
    const rnk: ToolResult = { modelContext: 'rank mc', clientBlock: { type: 'text', content: 'ranked' } };
    mockFirstSave.mockResolvedValueOnce(fsa);
    mockInfer.mockResolvedValueOnce(inf);
    mockRank.mockResolvedValueOnce(rnk);

    const a = crmExecute('first_save_analysis');
    expect(await a.execute({ listing_id: '11111111-2222-4333-8444-555555555555' }, { toolCallId: 'a', messages: [] })).toBe('analysis mc');
    expect(a.sinkCalls[0]!.result).toEqual(fsa);

    const b = crmExecute('infer_profile');
    expect(await b.execute({}, { toolCallId: 'b', messages: [] })).toBe('profile mc');
    expect(b.sinkCalls[0]!.result).toEqual(inf);

    const c = crmExecute('rank_compare');
    expect(await c.execute({ mode: 'rank' }, { toolCallId: 'c', messages: [] })).toBe('rank mc');
    expect(c.sinkCalls[0]!.result).toEqual(rnk);
  });

  it('budget exhausted → returns notice string, handler NOT called, sink NOT fired', async () => {
    mockAddListing.mockResolvedValue({
      modelContext: 'ok',
      clientBlock: { type: 'text', content: 'x' },
    } as ToolResult);

    const sinkCalls: unknown[] = [];
    const budget = { limit: 1, count: 0 };
    const registry = buildToolRegistry(
      { supabase: {} as never, campusId: 'c', campusSlug: 'uw-madison', userId: 'u-1' } as ToolContext,
      (_id, _n, result) => sinkCalls.push(result),
      budget,
    );
    const execute = (registry.add_listing as { execute: (...a: unknown[]) => Promise<unknown> }).execute;

    const r1 = await execute({ url: 'https://zillow.com/a' }, { toolCallId: 'c1', messages: [] });
    const r2 = await execute({ url: 'https://zillow.com/b' }, { toolCallId: 'c2', messages: [] });

    expect(r1).toBe('ok');
    expect(r2).toMatch(/limit reached/i);
    // Second call did NOT invoke the handler and did NOT fire the sink.
    expect(mockAddListing).toHaveBeenCalledTimes(1);
    expect(sinkCalls).toHaveLength(1);
  });

  it('budget check+increment is atomic across PARALLEL CRM calls in one step', async () => {
    mockAddListing.mockImplementation((async () => {
      await Promise.resolve(); // force a microtask gap so calls interleave
      return { modelContext: 'ok', clientBlock: { type: 'text', content: 'x' } } as ToolResult;
    }) as never);

    const sinkCalls: unknown[] = [];
    const budget = { limit: 2, count: 0 };
    const registry = buildToolRegistry(
      { supabase: {} as never, campusId: 'c', campusSlug: 'uw-madison', userId: 'u-1' } as ToolContext,
      (_id, _n, result) => sinkCalls.push(result),
      budget,
    );
    const execute = (registry.add_listing as { execute: (...a: unknown[]) => Promise<unknown> }).execute;

    const results = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        execute({ url: `https://zillow.com/${i}` }, { toolCallId: `c${i}`, messages: [] }),
      ),
    );
    const executed = results.filter((r) => r === 'ok');
    const rejected = results.filter((r) => typeof r === 'string' && /limit reached/i.test(r as string));
    expect(executed).toHaveLength(2);
    expect(rejected).toHaveLength(2);
    expect(mockAddListing).toHaveBeenCalledTimes(2);
    expect(sinkCalls).toHaveLength(2);
  });

  it('sign-in gate passes through: no userId → handler returns SIGN_IN_RESULT modelContext, sink still fires the sign-in block', async () => {
    // Real handler (unmocked for THIS case) so the sign-in gate runs. The
    // handler returns a ToolResult — it never throws.
    const real = await vi.importActual<typeof import('../../crm')>('../../crm');
    mockAddListing.mockImplementationOnce(real.addListingHandler);

    const sinkCalls: Array<{ result: ToolResult }> = [];
    const registry = buildToolRegistry(
      { supabase: {} as never, campusId: 'c', campusSlug: 'uw-madison', userId: undefined } as ToolContext,
      (_id, _n, result) => sinkCalls.push({ result }),
    );
    const execute = (registry.add_listing as { execute: (...a: unknown[]) => Promise<unknown> }).execute;

    const returned = await execute({ url: 'https://zillow.com/x' }, { toolCallId: 'c1', messages: [] });

    // Model gets the sign-in modelContext; sink fired the sign-in clientBlock.
    expect(String(returned).toLowerCase()).toMatch(/sign.?in/);
    expect(sinkCalls).toHaveLength(1);
    expect(sinkCalls[0]!.result.clientBlock.type).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// Surface scoping (CRM show_card wave)
// ---------------------------------------------------------------------------

describe('surface scoping (CRM show_card wave)', () => {
  const fakeContext = {
    supabase: {} as never,
    campusId: 'campus-uw-madison',
    campusSlug: 'uw-madison',
  } as ToolContext;
  const sink: ToolResultSink = () => {};

  it('CRM surface excludes the 4 explore-discovery tools', () => {
    const registry = buildToolRegistry(fakeContext, sink, undefined, 'crm');
    for (const name of ['search_listings', 'get_saved_listings', 'get_listing_detail', 'compare_listings']) {
      expect(registry[name as RegistryToolName]).toBeUndefined();
    }
  });

  it('CRM surface keeps the remaining 13 tools (9 legacy + 4 CRM)', () => {
    const registry = buildToolRegistry(fakeContext, sink, undefined, 'crm');
    expect(Object.keys(registry)).toHaveLength(13);
    for (const name of ['add_listing', 'first_save_analysis', 'infer_profile', 'rank_compare', 'schedule_tour', 'create_sublease']) {
      expect(registry[name as RegistryToolName]).toBeDefined();
    }
  });

  it('no surface (explore/default) keeps all 17 tools — unchanged', () => {
    expect(Object.keys(buildToolRegistry(fakeContext, sink))).toHaveLength(17);
  });

  it('toolSpecsForSurface("crm") omits excluded specs; default returns all 17', () => {
    expect(toolSpecsForSurface('crm').map((s) => s.name)).not.toContain('search_listings');
    expect(toolSpecsForSurface('crm')).toHaveLength(13);
    expect(toolSpecsForSurface()).toHaveLength(17);
  });
});

describe('tool-registry — AIN-26 confirmed default', () => {
  it('defaults schedule_tour.confirmed to false when omitted', () => {
    const spec = TOOL_SPECS.find((s) => s.name === 'schedule_tour')!;
    const parsed = (spec.inputSchema as z.ZodTypeAny).parse({
      listing_id: '11111111-2222-4333-8444-555555555555',
      student_name: 'A',
      student_email: 'a@wisc.edu',
      preferred_dates: ['2026-06-15'],
    }) as { confirmed: boolean };
    expect(parsed.confirmed).toBe(false);
  });

  it('defaults create_sublease.confirmed to false when omitted', () => {
    const spec = TOOL_SPECS.find((s) => s.name === 'create_sublease')!;
    const parsed = (spec.inputSchema as z.ZodTypeAny).parse({
      address: '456 W Gorham St, Madison WI',
      bedrooms_total: 2,
      bedrooms_available: 1,
    }) as { confirmed: boolean };
    expect(parsed.confirmed).toBe(false);
  });
});
