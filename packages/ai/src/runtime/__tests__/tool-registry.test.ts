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

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  TOOL_SPECS,
  HITL_TOOLS,
  buildToolRegistry,
  type ToolSpec,
} from '../tool-registry';
import { CRIBAI_TOOLS_BY_NAME } from '../../tools/schemas';
import type { ToolContext, ToolName } from '../../tools/types';

const EXPECTED_NAMES: readonly ToolName[] = [
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

/** Minimum-valid payload per tool — sufficient for `safeParse` to succeed. */
const VALID_INPUT_BY_TOOL: Record<ToolName, Record<string, unknown>> = {
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
};

describe('tool-registry — static spec', () => {
  it('exposes exactly 13 tools', () => {
    expect(TOOL_SPECS).toHaveLength(13);
  });

  it('exposes the canonical tool names in canonical order', () => {
    const actual = TOOL_SPECS.map((spec) => spec.name);
    expect(actual).toEqual(EXPECTED_NAMES);
  });

  it('has parity with the deterministic CRIBAI_TOOLS_BY_NAME registry', () => {
    const specNames = new Set(TOOL_SPECS.map((spec) => spec.name));
    const legacyNames = new Set(Object.keys(CRIBAI_TOOLS_BY_NAME));

    // Every legacy tool surfaces in the LLM-first registry
    for (const name of legacyNames) {
      expect(specNames.has(name as ToolName)).toBe(true);
    }
    // No accidental extras
    expect(specNames.size).toBe(legacyNames.size);
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
      ]
    `);
  });
});

describe('tool-registry — buildToolRegistry()', () => {
  it('builds a frozen registry with the canonical 13 keys', () => {
    const fakeContext = {
      supabase: {} as never,
      campusId: 'campus-uw-madison',
      campusSlug: 'uw-madison',
    } as ToolContext;

    const registry = buildToolRegistry(fakeContext);
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
